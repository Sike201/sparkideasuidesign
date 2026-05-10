import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  sendAndConfirmTransaction,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount
} from '@solana/web3.js';
import bs58 from 'bs58';
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { isApiKeyValid } from '../services/apiKeyService';
import { createInstructionFromBase64 } from './generateinstruction';

// Helper function to get Address Lookup Table accounts
async function getAddressLookupTableAccounts(
  connection: Connection,
  keys: string[]
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key))
  );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }
    return acc;
  }, new Array<AddressLookupTableAccount>());
}

type ENV = {
  RPC_URL: string;
  DB: D1Database;
  PRIVATE_KEY: string;
}

interface ExecuteInstructionRequest {
  base64Instruction: string;
  payer?: string; // Optional payer, defaults to env wallet
  addressLookupTableAddresses?: string[]; // Optional ALTs for versioned transactions
  useVersionedTransaction?: boolean; // Whether to use versioned transaction (default: false)
}

interface ExecuteInstructionResponse {
  success: boolean;
  transactionSignature?: string;
  error?: string;
  [key: string]: any;
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    // Authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['write'] })) {
    //   return jsonResponse(null, 401);
    // }

    const requestBody = await ctx.request.json() as ExecuteInstructionRequest;
    
    // Validate required fields
    if (!requestBody.base64Instruction) {
      return jsonResponse({
        success: false,
        error: 'Missing required field: base64Instruction'
      }, 400);
    }

    // Validate base64 instruction data
    let instructionData: Buffer;
    try {
      instructionData = Buffer.from(requestBody.base64Instruction, 'base64');
      if (instructionData.length === 0) {
        throw new Error('Empty instruction data');
      }
    } catch (error) {
      return jsonResponse({
        success: false,
        error: 'Invalid base64 instruction data'
      }, 400);
    }

    // Deserialize the instruction from base64
    let instruction: TransactionInstruction;
    try {
      instruction = createInstructionFromBase64(requestBody.base64Instruction);
      
      console.log('[Execute Instruction] Deserialized instruction:', {
        programId: instruction.programId.toBase58(),
        accountsCount: instruction.keys.length,
        dataLength: instruction.data.length
      });
      
    } catch (error) {
      return jsonResponse({
        success: false,
        error: `Failed to deserialize instruction: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, 400);
    }

    // Set up wallet from environment
    const privateKeyString = ctx.env.PRIVATE_KEY;
    if (!privateKeyString || typeof privateKeyString !== 'string') {
      throw new Error('Invalid private key format');
    }

    const privateKeyUint8Array = bs58.decode(privateKeyString);
    const wallet = Keypair.fromSecretKey(privateKeyUint8Array);
    
    // Set payer (default to env wallet if not provided)
    const payer = requestBody.payer ? new PublicKey(requestBody.payer) : wallet.publicKey;
    const useVersionedTransaction = requestBody.useVersionedTransaction || false;
    const addressLookupTableAddresses = requestBody.addressLookupTableAddresses || [];

    console.log('[Execute Instruction] Executing instruction with parameters:', {
      programId: instruction.programId.toBase58(),
      instructionDataLength: instruction.data.length,
      accountsCount: instruction.keys.length,
      payer: payer.toBase58(),
      useVersionedTransaction,
      addressLookupTableAddresses: addressLookupTableAddresses.length
    });

    // Initialize connection
    const connection = new Connection(ctx.env.RPC_URL, 'confirmed');
    
    // Check if the program ID is supported by the RPC
    try {
      const programInfo = await connection.getAccountInfo(instruction.programId);
      if (!programInfo) {
        return jsonResponse({
          success: false,
          error: `Program ${instruction.programId.toBase58()} is not deployed on this network. This might be a Jupiter program that's only available on mainnet.`
        }, 400);
      }
      console.log('[Execute Instruction] Program verified on network:', instruction.programId.toBase58());
    } catch (error) {
      console.log('[Execute Instruction] Could not verify program, proceeding anyway:', error);
    }

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();

    // Determine required signers
    const requiredSigners = [wallet];
    
    // Add any additional signers from instruction accounts
    for (const account of instruction.keys) {
      if (account.isSigner && !account.pubkey.equals(wallet.publicKey)) {
        // For now, we can only sign with the main wallet
        // In a real implementation, you might need to handle multiple keypairs
        console.log('[Execute Instruction] Warning: Account requires signature but is not the main wallet:', account.pubkey.toBase58());
      }
    }

    console.log('[Execute Instruction] Signing transaction with keypairs:', requiredSigners.map(signer => signer.publicKey.toString()));

    let transaction: Transaction | VersionedTransaction;

    // Auto-detect if we need versioned transaction based on account count
    const needsVersionedTransaction = instruction.keys.length > 20 || useVersionedTransaction;
    
    if (needsVersionedTransaction && addressLookupTableAddresses.length > 0) {
      // Use versioned transaction with Address Lookup Tables
      console.log('[Execute Instruction] Building versioned transaction with ALTs...');
      
      const addressLookupTableAccounts = await getAddressLookupTableAccounts(connection, addressLookupTableAddresses);
      
      const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message(addressLookupTableAccounts);
      
      transaction = new VersionedTransaction(messageV0);
      
      // Sign the versioned transaction
      transaction.sign(requiredSigners);
      
    } else {
      // Use legacy transaction
      console.log('[Execute Instruction] Building legacy transaction...');
      
      // Warn if instruction has many accounts but no ALTs provided
      if (instruction.keys.length > 20 && addressLookupTableAddresses.length === 0) {
        console.log('[Execute Instruction] Warning: Instruction has many accounts but no ALTs provided. Transaction might fail due to size limits.');
      }
      
      transaction = new Transaction().add(instruction);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer;
      
      // Sign the legacy transaction
      transaction.sign(...requiredSigners);
    }

    // Send and confirm the transaction
    console.log('[Execute Instruction] Sending transaction to Solana network...');
    
    try {
      let transactionSignature: string;
      
      if (transaction instanceof VersionedTransaction) {
        // Send versioned transaction
        transactionSignature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        });
        
        // Wait for confirmation
        await connection.confirmTransaction(transactionSignature, 'confirmed');
      } else {
        // Send legacy transaction
        transactionSignature = await sendAndConfirmTransaction(
          connection,
          transaction,
          requiredSigners,
          {
            commitment: 'confirmed',
            skipPreflight: false,
            maxRetries: 3
          }
        );
      }

      console.log('[Execute Instruction] Transaction confirmed:', transactionSignature);

      const response: ExecuteInstructionResponse = {
        success: true,
        transactionSignature: transactionSignature
      };

      return jsonResponse(response);
    } catch (confirmationError) {
      // Check if this is a confirmation timeout vs actual failure
      console.log('[Execute Instruction] Confirmation error, checking transaction status...');
      
      // Check if the error is a blockhash expiration (confirmation timeout)
      const isBlockhashExpired = confirmationError instanceof Error && 
        (confirmationError.message.includes('block height exceeded') || 
         confirmationError.message.includes('TransactionExpiredBlockheightExceededError'));
      
      if (isBlockhashExpired) {
        console.log('[Execute Instruction] Blockhash expired, getting fresh blockhash and retrying...');
        
        try {
          // Get a fresh blockhash
          const { blockhash: freshBlockhash } = await connection.getLatestBlockhash();
          
          let freshTransaction: Transaction | VersionedTransaction;
          
          if (useVersionedTransaction && addressLookupTableAddresses.length > 0) {
            // Create fresh versioned transaction
            const addressLookupTableAccounts = await getAddressLookupTableAccounts(connection, addressLookupTableAddresses);
            
            const messageV0 = new TransactionMessage({
              payerKey: payer,
              recentBlockhash: freshBlockhash,
              instructions: [instruction],
            }).compileToV0Message(addressLookupTableAccounts);
            
            freshTransaction = new VersionedTransaction(messageV0);
            freshTransaction.sign(requiredSigners);
            
            // Send versioned transaction
            const transactionSignature = await connection.sendTransaction(freshTransaction, {
              skipPreflight: false,
              preflightCommitment: 'confirmed'
            });
            
            return jsonResponse({
              success: true,
              transactionSignature: transactionSignature,
              note: 'Versioned transaction sent with fresh blockhash after confirmation timeout'
            });
            
          } else {
            // Create fresh legacy transaction
            freshTransaction = new Transaction().add(instruction);
            freshTransaction.recentBlockhash = freshBlockhash;
            freshTransaction.feePayer = payer;
            freshTransaction.sign(...requiredSigners);
            
            // Send without waiting for confirmation
            const transactionSignature = await connection.sendRawTransaction(
              freshTransaction.serialize(),
              { skipPreflight: false, preflightCommitment: 'confirmed' }
            );
            
            console.log('[Execute Instruction] Fresh transaction sent successfully:', transactionSignature);
            
            return jsonResponse({
              success: true,
              transactionSignature: transactionSignature,
              note: 'Transaction sent with fresh blockhash after confirmation timeout'
            });
          }
          
        } catch (freshSendError) {
          console.error('[Execute Instruction] Failed to send fresh transaction:', freshSendError);
          throw freshSendError;
        }
      } else {
        // For other types of errors, just throw them
        console.error('[Execute Instruction] Non-blockhash error:', confirmationError);
        throw confirmationError;
      }
    }

  } catch (error) {
    console.error('[Execute Instruction] Error executing instruction:', error);
    await reportError(ctx.env.DB, error);
    
    // Provide more specific error messages for common Jupiter errors
    let errorMessage = error instanceof Error ? error.message : 'Failed to execute instruction';
    
    if (errorMessage.includes('custom program error: 0x1789')) {
      errorMessage = 'Jupiter swap failed: Insufficient token balance or slippage exceeded. Please check your SOL balance and try with higher slippage tolerance.';
    } else if (errorMessage.includes('custom program error: 0x1770')) {
      errorMessage = 'Jupiter swap failed: Invalid token account or account not initialized.';
    } else if (errorMessage.includes('custom program error: 0x1771')) {
      errorMessage = 'Jupiter swap failed: Insufficient liquidity in the pool.';
    } else if (errorMessage.includes('Transaction too large')) {
      errorMessage = 'Transaction too large: Use versioned transactions with Address Lookup Tables for instructions with many accounts.';
    }
    
    return jsonResponse({
      success: false,
      error: errorMessage
    }, 500);
  }
};

// GET endpoint for API documentation
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    return jsonResponse({
      success: true,
      documentation: {
        description: 'API for executing Solana instructions from base64 data',
        usage: 'POST with instruction data, program ID, and required accounts',
        example: {
          base64Instruction: 'YOUR_BASE64_ENCODED_INSTRUCTION_DATA',
          payer: 'YOUR_PAYER_PUBLIC_KEY', // Optional, defaults to env wallet
          useVersionedTransaction: true, // Optional, for large transactions with many accounts
          addressLookupTableAddresses: ['ALT_ADDRESS_1', 'ALT_ADDRESS_2'] // Optional, required for versioned transactions
        },
        notes: [
          'The base64Instruction should contain the serialized instruction data from generateinstruction API',
          'The instruction, program ID, and accounts are automatically extracted from the base64 data',
          'The payer account must have sufficient SOL to pay for transaction fees',
          'Only the main wallet can sign transactions (additional signers not supported yet)',
          'Use versioned transactions with ALTs for instructions with many accounts (>20) to avoid transaction size limits',
          'Address Lookup Table addresses are provided by Jupiter swap API for complex swaps',
          'Jupiter programs are only available on mainnet - use mainnet RPC for Jupiter swaps',
          'ALTs are required for Jupiter swaps because they have 60+ accounts (exceeds 1232-byte transaction limit)'
        ]
      }
    }, 200);

  } catch (error) {
    console.error('[Execute Instruction] Error in GET request:', error);
    await reportError(ctx.env.DB, error);
    
    return jsonResponse({
      success: false,
      error: 'Failed to get API information'
    }, 500);
  }
};
