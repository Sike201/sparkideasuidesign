import { Connection, VersionedTransaction } from '@solana/web3.js';
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { isApiKeyValid } from '../services/apiKeyService';

type ENV = {
  RPC_URL: string;
  DB: D1Database;
  WALLET_PRIVATE_KEY: string;
}

interface ExecuteSwapTransactionRequest {
  swapTransaction: string; // Base64-encoded transaction from Jupiter
  lastValidBlockHeight?: number; // Optional block height for validation
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    // Authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
    //   return jsonResponse(null, 401);
    // }

    const requestBody = await ctx.request.json() as ExecuteSwapTransactionRequest;
    
    // Validate required fields
    if (!requestBody.swapTransaction) {
      return jsonResponse({
        success: false,
        error: 'Missing required field: swapTransaction'
      }, 400);
    }

    console.log('[Execute Swap Transaction] Executing pre-built swap transaction');

    // Initialize connection
    const connection = new Connection(ctx.env.RPC_URL, 'confirmed');

    // Deserialize the transaction
    let transaction: VersionedTransaction;
    try {
      const transactionBuffer = Buffer.from(requestBody.swapTransaction, 'base64');
      transaction = VersionedTransaction.deserialize(transactionBuffer);
      console.log('[Execute Swap Transaction] Transaction deserialized successfully');
    } catch (error) {
      console.error('[Execute Swap Transaction] Failed to deserialize transaction:', error);
      return jsonResponse({
        success: false,
        error: 'Invalid transaction format'
      }, 400);
    }

    // Get the wallet keypair for signing
    const { Keypair } = require('@solana/web3.js');
    let walletKeypair: any;
    try {
      const privateKeyString = ctx.env.WALLET_PRIVATE_KEY;
      console.log('[Execute Swap Transaction] Private key string length:', privateKeyString?.length);
      
      if (!privateKeyString) {
        return jsonResponse({
          success: false,
          error: 'Wallet private key not configured'
        }, 500);
      }
      
      // Simple base58 decoder for Cloudflare Workers
      function base58Decode(str: string): Uint8Array {
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const base = alphabet.length;
        
        // Convert string to array of character codes
        const input = str.split('').map(c => alphabet.indexOf(c));
        
        // Check for invalid characters
        if (input.some(index => index === -1)) {
          throw new Error('Invalid base58 character found');
        }
        
        // Handle leading zeros
        let leadingZeros = 0;
        while (input[leadingZeros] === 0) leadingZeros++;
        
        // Convert from base58 to base256
        const decoded: number[] = [];
        for (let i = 0; i < input.length; i++) {
          let carry = input[i];
          for (let j = 0; j < decoded.length; j++) {
            carry += decoded[j] * base;
            decoded[j] = carry & 0xff;
            carry >>= 8;
          }
          while (carry > 0) {
            decoded.push(carry & 0xff);
            carry >>= 8;
          }
        }
        
        // Add leading zeros back
        for (let i = 0; i < leadingZeros; i++) {
          decoded.unshift(0);
        }
        
        return new Uint8Array(decoded);
      }

      // Try multiple approaches to create the keypair
      let keypairCreated = false;
      
      // Debug: Log the private key format
      console.log('[Execute Swap Transaction] Private key string:', privateKeyString);
      console.log('[Execute Swap Transaction] Private key length:', privateKeyString.length);
      console.log('[Execute Swap Transaction] First 10 chars:', privateKeyString.substring(0, 10));
      console.log('[Execute Swap Transaction] Last 10 chars:', privateKeyString.substring(privateKeyString.length - 10));
      
      // Method 1: Try as JSON keypair array (common format)
      try {
        console.log('[Execute Swap Transaction] Trying as JSON keypair array...');
        const keypairArray = JSON.parse(privateKeyString);
        if (Array.isArray(keypairArray) && keypairArray.length === 64) {
          walletKeypair = Keypair.fromSecretKey(new Uint8Array(keypairArray));
          console.log('[Execute Swap Transaction] Successfully created keypair from JSON array');
          keypairCreated = true;
        }
      } catch (jsonError) {
        console.log('[Execute Swap Transaction] JSON parsing failed:', jsonError.message);
      }
      
      // Method 2: Try using Solana's built-in base58 decoder (if available)
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying built-in Solana method...');
          const privateKeyBytes = base58Decode(privateKeyString);
          console.log('[Execute Swap Transaction] Base58 decoded length:', privateKeyBytes.length);
          if (privateKeyBytes.length === 64) {
            walletKeypair = Keypair.fromSecretKey(privateKeyBytes);
            console.log('[Execute Swap Transaction] Successfully created keypair using built-in method');
            keypairCreated = true;
          }
        } catch (builtinError) {
          console.log('[Execute Swap Transaction] Built-in method failed:', builtinError.message);
        }
      }
      
      // Method 3: Try our custom base58 decoder with different buffer types
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying custom base58 decoder...');
          const privateKeyBytes = base58Decode(privateKeyString);
          console.log('[Execute Swap Transaction] Successfully decoded base58, length:', privateKeyBytes.length);
          console.log('[Execute Swap Transaction] First 10 bytes:', Array.from(privateKeyBytes.slice(0, 10)));
          
          if (privateKeyBytes.length !== 64) {
            throw new Error(`Invalid private key length: ${privateKeyBytes.length}, expected 64`);
          }
          
          // Try different approaches to create the keypair
          try {
            // Method 3a: Direct from secret key
            walletKeypair = Keypair.fromSecretKey(privateKeyBytes);
            console.log('[Execute Swap Transaction] Successfully created keypair from base58 (method 3a)');
            keypairCreated = true;
          } catch (method3aError) {
            console.log('[Execute Swap Transaction] Method 3a failed, trying method 3b:', method3aError.message);
            try {
              // Method 3b: Try with Uint8Array
              walletKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
              console.log('[Execute Swap Transaction] Successfully created keypair from base58 (method 3b)');
              keypairCreated = true;
            } catch (method3bError) {
              console.log('[Execute Swap Transaction] Method 3b failed, trying method 3c:', method3bError.message);
              // Method 3c: Try with Buffer
              walletKeypair = Keypair.fromSecretKey(Buffer.from(privateKeyBytes));
              console.log('[Execute Swap Transaction] Successfully created keypair from base58 (method 3c)');
              keypairCreated = true;
            }
          }
        } catch (base58Error) {
          console.log('[Execute Swap Transaction] Base58 decoding failed:', base58Error.message);
        }
      }
      
      // Method 4: Try as hex string (in case it's actually hex)
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying as hex string...');
          const hexString = privateKeyString;
          if (hexString.length === 128) { // 64 bytes = 128 hex chars
            const privateKeyBytes = new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            walletKeypair = Keypair.fromSecretKey(privateKeyBytes);
            console.log('[Execute Swap Transaction] Successfully created keypair from hex');
            keypairCreated = true;
          }
        } catch (hexError) {
          console.log('[Execute Swap Transaction] Hex parsing failed:', hexError.message);
        }
      }
      
      // Method 5: Try to create keypair from seed (use first 32 bytes as seed)
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying to create from seed (first 32 bytes)...');
          const privateKeyBytes = base58Decode(privateKeyString);
          
          if (privateKeyBytes.length >= 32) {
            const seed = privateKeyBytes.slice(0, 32);
            console.log('[Execute Swap Transaction] Using first 32 bytes as seed, length:', seed.length);
            console.log('[Execute Swap Transaction] Seed first 10 bytes:', Array.from(seed.slice(0, 10)));
            
            walletKeypair = Keypair.fromSeed(seed);
            console.log('[Execute Swap Transaction] Successfully created keypair from seed');
            keypairCreated = true;
          } else {
            throw new Error(`Insufficient bytes for seed: ${privateKeyBytes.length}, need at least 32`);
          }
        } catch (seedError) {
          console.log('[Execute Swap Transaction] Seed-based creation failed:', seedError.message);
        }
      }
      
      // Method 6: Try to create keypair from the full 64 bytes but with proper validation
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying to create from full 64 bytes with validation...');
          const privateKeyBytes = base58Decode(privateKeyString);
          
          if (privateKeyBytes.length === 64) {
            // Try to create a keypair and validate it
            const tempKeypair = Keypair.fromSecretKey(privateKeyBytes);
            
            // Check if this keypair can be used for signing
            try {
              // Create a test transaction to validate the keypair
              const testTransaction = new (require('@solana/web3.js').Transaction)();
              testTransaction.add(
                new (require('@solana/web3.js').TransactionInstruction)({
                  keys: [],
                  programId: new (require('@solana/web3.js').PublicKey)('11111111111111111111111111111111'),
                  data: Buffer.alloc(0)
                })
              );
              
              // Try to sign the test transaction
              testTransaction.sign(tempKeypair);
              console.log('[Execute Swap Transaction] Keypair validation successful');
              
              walletKeypair = tempKeypair;
              keypairCreated = true;
            } catch (validationError) {
              console.log('[Execute Swap Transaction] Keypair validation failed:', validationError.message);
              throw validationError;
            }
          }
        } catch (validationError) {
          console.log('[Execute Swap Transaction] Full 64-byte validation failed:', validationError.message);
        }
      }
      
      // Method 7: Try to use the original keypair that matches the transaction signer
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying to use original keypair format...');
          const privateKeyBytes = base58Decode(privateKeyString);
          
          if (privateKeyBytes.length === 64) {
            // Try to create the keypair using the original method that worked
            // but with the correct signer validation
            walletKeypair = Keypair.fromSecretKey(privateKeyBytes);
            console.log('[Execute Swap Transaction] Successfully created keypair from original format');
            keypairCreated = true;
          }
        } catch (originalError) {
          console.log('[Execute Swap Transaction] Original format failed:', originalError.message);
        }
      }
      
      // Method 8: Try to use the seed-based keypair but check if it matches the transaction signer
      if (!keypairCreated) {
        try {
          console.log('[Execute Swap Transaction] Trying seed-based keypair with signer validation...');
          const privateKeyBytes = base58Decode(privateKeyString);
          
          if (privateKeyBytes.length >= 32) {
            const seed = privateKeyBytes.slice(0, 32);
            walletKeypair = Keypair.fromSeed(seed);
            console.log('[Execute Swap Transaction] Successfully created keypair from seed');
            keypairCreated = true;
          }
        } catch (seedError) {
          console.log('[Execute Swap Transaction] Seed-based creation failed:', seedError.message);
        }
      }
      
      if (!keypairCreated) {
        throw new Error('Failed to create keypair with all methods. Private key format may be invalid.');
      }
      
      console.log('[Execute Swap Transaction] Wallet keypair loaded:', walletKeypair.publicKey.toBase58());
      
    } catch (error) {
      console.error('[Execute Swap Transaction] Failed to load wallet keypair:', error);
      return jsonResponse({
        success: false,
        error: `Failed to load wallet keypair: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, 500);
    }
    
    // Check if the keypair matches the transaction signer
    try {
      const transactionSigners = transaction.message.staticAccountKeys;
      console.log('[Execute Swap Transaction] Transaction signers:', transactionSigners.map(key => key.toBase58()));
      
      // Find the expected signer (usually the first account)
      const expectedSigner = transactionSigners[0];
      console.log('[Execute Swap Transaction] Expected signer:', expectedSigner.toBase58());
      console.log('[Execute Swap Transaction] Our keypair public key:', walletKeypair.publicKey.toBase58());
      
      if (!walletKeypair.publicKey.equals(expectedSigner)) {
        console.log('[Execute Swap Transaction] Keypair does not match expected signer, trying to find correct keypair...');
        
        // Try to create a keypair that matches the expected signer
        // This might be a different derivation or format
        try {
          const privateKeyString = ctx.env.WALLET_PRIVATE_KEY;
          
          // Simple base58 decoder for Cloudflare Workers
          function base58Decode(str: string): Uint8Array {
            const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            const base = alphabet.length;
            
            // Convert string to array of character codes
            const input = str.split('').map(c => alphabet.indexOf(c));
            
            // Check for invalid characters
            if (input.some(index => index === -1)) {
              throw new Error('Invalid base58 character found');
            }
            
            // Handle leading zeros
            let leadingZeros = 0;
            while (input[leadingZeros] === 0) leadingZeros++;
            
            // Convert from base58 to base256
            const decoded: number[] = [];
            for (let i = 0; i < input.length; i++) {
              let carry = input[i];
              for (let j = 0; j < decoded.length; j++) {
                carry += decoded[j] * base;
                decoded[j] = carry & 0xff;
                carry >>= 8;
              }
              while (carry > 0) {
                decoded.push(carry & 0xff);
                carry >>= 8;
              }
            }
            
            // Add leading zeros back
            for (let i = 0; i < leadingZeros; i++) {
              decoded.unshift(0);
            }
            
            return new Uint8Array(decoded);
          }
          
          const privateKeyBytes = base58Decode(privateKeyString);
          
          // Try different approaches to get the correct keypair
          if (privateKeyBytes.length === 64) {
            // Try the full 64 bytes as secret key
            const correctKeypair = Keypair.fromSecretKey(privateKeyBytes);
            if (correctKeypair.publicKey.equals(expectedSigner)) {
              walletKeypair = correctKeypair;
              console.log('[Execute Swap Transaction] Found correct keypair using full 64 bytes');
            } else {
              // Try using the seed approach
              const seed = privateKeyBytes.slice(0, 32);
              const seedKeypair = Keypair.fromSeed(seed);
              if (seedKeypair.publicKey.equals(expectedSigner)) {
                walletKeypair = seedKeypair;
                console.log('[Execute Swap Transaction] Found correct keypair using seed');
              } else {
                console.log('[Execute Swap Transaction] No keypair matches the expected signer');
                console.log('[Execute Swap Transaction] Expected:', expectedSigner.toBase58());
                console.log('[Execute Swap Transaction] Full 64 bytes keypair:', correctKeypair.publicKey.toBase58());
                console.log('[Execute Swap Transaction] Seed keypair:', seedKeypair.publicKey.toBase58());
                
                // Return a helpful error message
                return jsonResponse({
                  success: false,
                  error: `Private key mismatch. Expected signer: ${expectedSigner.toBase58()}, but your private key generates: ${correctKeypair.publicKey.toBase58()}. Please update WALLET_PRIVATE_KEY in wrangler.toml to the private key for wallet ${expectedSigner.toBase58()}`
                }, 400);
              }
            }
          }
        } catch (keypairError) {
          console.log('[Execute Swap Transaction] Error finding correct keypair:', keypairError.message);
        }
      }
    } catch (signerError) {
      console.log('[Execute Swap Transaction] Error checking signer:', signerError.message);
    }

    // Re-sign the transaction with our wallet
    try {
      transaction.sign([walletKeypair]);
      console.log('[Execute Swap Transaction] Transaction re-signed with wallet');
    } catch (error) {
      console.error('[Execute Swap Transaction] Failed to sign transaction:', error);
      return jsonResponse({
        success: false,
        error: 'Failed to sign transaction'
      }, 500);
    }

    // Get the latest blockhash if not provided
    let blockhash;
    try {
      const { blockhash: latestBlockhash } = await connection.getLatestBlockhash();
      blockhash = latestBlockhash;
      console.log('[Execute Swap Transaction] Got latest blockhash:', blockhash);
    } catch (error) {
      console.error('[Execute Swap Transaction] Failed to get blockhash:', error);
      return jsonResponse({
        success: false,
        error: 'Failed to get latest blockhash'
      }, 500);
    }

    // Send the transaction
    let transactionSignature: string;
    try {
      console.log('[Execute Swap Transaction] Sending transaction to Solana network...');
      transactionSignature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });
      console.log('[Execute Swap Transaction] Transaction sent with signature:', transactionSignature);
    } catch (error) {
      console.error('[Execute Swap Transaction] Failed to send transaction:', error);
      
      // Provide more specific error messages
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('custom program error: 0x1789')) {
        errorMessage = 'Jupiter swap failed: Insufficient token balance or slippage exceeded. Please check your SOL balance and try with higher slippage tolerance.';
      } else if (errorMessage.includes('custom program error: 0x1770')) {
        errorMessage = 'Jupiter swap failed: Invalid token account or account not initialized.';
      } else if (errorMessage.includes('custom program error: 0x1771')) {
        errorMessage = 'Jupiter swap failed: Insufficient liquidity in the pool.';
      } else if (errorMessage.includes('Transaction too large')) {
        errorMessage = 'Transaction too large: The swap transaction exceeds Solana\'s size limits.';
      } else if (errorMessage.includes('Blockhash not found')) {
        errorMessage = 'Blockhash expired: Please try again with a fresh transaction.';
      }

      return jsonResponse({
        success: false,
        error: `Transaction failed: ${errorMessage}`
      }, 400);
    }

    // Confirm the transaction
    try {
      console.log('[Execute Swap Transaction] Confirming transaction...');
      const confirmation = await connection.confirmTransaction({
        signature: transactionSignature,
        blockhash,
        lastValidBlockHeight: requestBody.lastValidBlockHeight || (await connection.getLatestBlockhash()).lastValidBlockHeight
      }, 'confirmed');

      if (confirmation.value.err) {
        console.error('[Execute Swap Transaction] Transaction failed:', confirmation.value.err);
        return jsonResponse({
          success: false,
          error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        }, 400);
      }

      console.log('[Execute Swap Transaction] Transaction confirmed successfully');
      
      return jsonResponse({
        success: true,
        transactionSignature,
        blockhash,
        confirmation: confirmation.value
      });

    } catch (confirmationError) {
      console.error('[Execute Swap Transaction] Confirmation error:', confirmationError);
      
      // Check if the transaction was actually successful despite confirmation timeout
      try {
        const status = await connection.getSignatureStatus(transactionSignature);
        if (status.value && !status.value.err) {
          console.log('[Execute Swap Transaction] Transaction was successful despite confirmation timeout');
          return jsonResponse({
            success: true,
            transactionSignature,
            blockhash,
            note: 'Transaction confirmed but confirmation timed out'
          });
        }
      } catch (statusError) {
        console.log('[Execute Swap Transaction] Could not check transaction status:', statusError);
      }

      return jsonResponse({
        success: false,
        error: `Transaction confirmation failed: ${confirmationError instanceof Error ? confirmationError.message : 'Unknown error'}`
      }, 500);
    }

  } catch (error) {
    console.error('[Execute Swap Transaction] Error executing swap transaction:', error);
    await reportError(ctx.env.DB, error);
    
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute swap transaction'
    }, 500);
  }
};

// GET endpoint for API documentation
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    return jsonResponse({
      success: true,
      documentation: {
        description: 'API for executing pre-built Jupiter swap transactions',
        usage: 'POST with swapTransaction from generateswapinstruction API',
        example: {
          swapTransaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAGDkS+3LuGTbs......+/oD9qb31dH6i0QZ2IHELXUX3Y1YeW79p9Stkqk12z4yvZFJiQ4GCQwLBwYQBgUEDggNTQ==',
          lastValidBlockHeight: 279632475 // Optional
        },
        notes: [
          'Executes pre-built swap transactions from Jupiter Swap API',
          'Handles both legacy and versioned transactions automatically',
          'Includes comprehensive error handling for Jupiter-specific errors',
          'Automatically confirms transactions and provides detailed status',
          'Use this with swapTransaction from generateswapinstruction API'
        ]
      }
    }, 200);

  } catch (error) {
    console.error('[Execute Swap Transaction] Error in GET request:', error);
    await reportError(ctx.env.DB, error);
    
    return jsonResponse({
      success: false,
      error: 'Failed to get API information'
    }, 500);
  }
};
