// src/functions/api/generateinstruction.ts

import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { jsonResponse } from './cfPagesFunctionsUtils';
import { isApiKeyValid } from '../services/apiKeyService';

type ENV = {
  RPC_URL: string;
  VITE_ENVIRONMENT_TYPE?: string;
  DB: D1Database;
}

interface GenerateInstructionRequest {
  instructionType: 'transfer' | 'transferChecked' | 'systemTransfer' | 'createTokenAccount';
  params: {
    // For token transfers
    sourceTokenAccount?: string;
    destinationTokenAccount?: string;
    authority?: string;
    amount?: number;
    mint?: string;
    decimals?: number;
    
    // For system transfers
    fromPubkey?: string;
    toPubkey?: string;
    lamports?: number;
    
    // For creating token accounts
    payer?: string;
    owner?: string;
    tokenMint?: string;
  };
}

interface GenerateInstructionResponse {
  success: boolean;
  base64Instruction?: string;
  instructionDetails?: {
    programId: string;
    accounts: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: string;
  };
  error?: string;
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    // Authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
    //   return jsonResponse(null, 401);
    // }

    const requestBody: GenerateInstructionRequest = await ctx.request.json();
    const { instructionType, params } = requestBody;

    // Validate required fields
    if (!instructionType || !params) {
      return jsonResponse({
        success: false,
        error: 'Missing required fields: instructionType and params'
      }, 400);
    }

    let instruction: TransactionInstruction;
    let instructionDetails: any;

    try {
      switch (instructionType) {
        case 'transfer':
          instruction = await generateTokenTransferInstruction(params);
          break;
        case 'transferChecked':
          instruction = await generateTokenTransferCheckedInstruction(params);
          break;
        case 'systemTransfer':
          instruction = await generateSystemTransferInstruction(params);
          break;
        case 'createTokenAccount':
          instruction = await generateCreateTokenAccountInstruction(params);
          break;
        default:
          return jsonResponse({
            success: false,
            error: `Unsupported instruction type: ${instructionType}. Supported types: transfer, transferChecked, systemTransfer, createTokenAccount`
          }, 400);
      }

      // Extract instruction details
      instructionDetails = {
        programId: instruction.programId.toBase58(),
        accounts: instruction.keys.map(key => ({
          pubkey: key.pubkey.toBase58(),
          isSigner: key.isSigner,
          isWritable: key.isWritable
        })),
        data: instruction.data.toString('hex')
      };

      // Serialize instruction to Base64
      const base64Instruction = serializeInstructionToBase64(instruction);

      console.log(`[Instruction Generation] Generated ${instructionType} instruction`);
      console.log(`[Instruction Generation] Program ID: ${instructionDetails.programId}`);
      console.log(`[Instruction Generation] Accounts: ${instructionDetails.accounts.length}`);
      console.log(`[Instruction Generation] Data length: ${instruction.data.length} bytes`);

      const response = {
        success: true,
        base64Instruction,
        instructionDetails
      };

      return jsonResponse(response, 200);

    } catch (error) {
      console.error(`[Instruction Generation] Error generating ${instructionType} instruction:`, error);
      return jsonResponse({
        success: false,
        error: `Failed to generate ${instructionType} instruction: ${error instanceof Error ? error.message : String(error)}`
      }, 500);
    }

  } catch (error) {
    console.error('[Instruction Generation] Error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500);
  }
};

// Generate token transfer instruction
async function generateTokenTransferInstruction(params: any): Promise<TransactionInstruction> {
  const { sourceTokenAccount, destinationTokenAccount, authority, amount } = params;

  // Validate required parameters
  if (!sourceTokenAccount || !destinationTokenAccount || !authority || amount === undefined) {
    throw new Error('Missing required parameters for token transfer: sourceTokenAccount, destinationTokenAccount, authority, amount');
  }

  // Validate public keys
  let sourceTokenAccountPubKey: PublicKey;
  let destinationTokenAccountPubKey: PublicKey;
  let authorityPubKey: PublicKey;

  try {
    sourceTokenAccountPubKey = new PublicKey(sourceTokenAccount);
    destinationTokenAccountPubKey = new PublicKey(destinationTokenAccount);
    authorityPubKey = new PublicKey(authority);
  } catch (error) {
    throw new Error('Invalid public key format in token transfer parameters');
  }

  // Validate amount
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('Amount must be a positive integer');
  }

  // Create the transfer instruction
  const instruction = createTransferInstruction(
    sourceTokenAccountPubKey,
    destinationTokenAccountPubKey,
    authorityPubKey,
    amount
  );

  return instruction;
}

// Generate token transfer checked instruction (with mint validation)
async function generateTokenTransferCheckedInstruction(params: any): Promise<TransactionInstruction> {
  const { sourceTokenAccount, destinationTokenAccount, authority, amount, mint, decimals } = params;

  // Validate required parameters
  if (!sourceTokenAccount || !destinationTokenAccount || !authority || amount === undefined || !mint || decimals === undefined) {
    throw new Error('Missing required parameters for token transfer checked: sourceTokenAccount, destinationTokenAccount, authority, amount, mint, decimals');
  }

  // Validate public keys
  let sourceTokenAccountPubKey: PublicKey;
  let destinationTokenAccountPubKey: PublicKey;
  let authorityPubKey: PublicKey;
  let mintPubKey: PublicKey;

  try {
    sourceTokenAccountPubKey = new PublicKey(sourceTokenAccount);
    destinationTokenAccountPubKey = new PublicKey(destinationTokenAccount);
    authorityPubKey = new PublicKey(authority);
    mintPubKey = new PublicKey(mint);
  } catch (error) {
    throw new Error('Invalid public key format in token transfer checked parameters');
  }

  // Validate amount and decimals
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('Amount must be a positive integer');
  }
  if (decimals < 0 || decimals > 9 || !Number.isInteger(decimals)) {
    throw new Error('Decimals must be an integer between 0 and 9');
  }

  // Create the transfer checked instruction
  const instruction = createTransferCheckedInstruction(
    sourceTokenAccountPubKey,
    mintPubKey,
    destinationTokenAccountPubKey,
    authorityPubKey,
    amount,
    decimals
  );

  return instruction;
}

// Generate system transfer instruction (SOL transfer)
async function generateSystemTransferInstruction(params: any): Promise<TransactionInstruction> {
  const { fromPubkey, toPubkey, lamports } = params;

  // Validate required parameters
  if (!fromPubkey || !toPubkey || lamports === undefined) {
    throw new Error('Missing required parameters for system transfer: fromPubkey, toPubkey, lamports');
  }

  // Validate public keys
  let fromPubkeyPubKey: PublicKey;
  let toPubkeyPubKey: PublicKey;

  try {
    fromPubkeyPubKey = new PublicKey(fromPubkey);
    toPubkeyPubKey = new PublicKey(toPubkey);
  } catch (error) {
    throw new Error('Invalid public key format in system transfer parameters');
  }

  // Validate lamports
  if (lamports <= 0 || !Number.isInteger(lamports)) {
    throw new Error('Lamports must be a positive integer');
  }

  // Create the system transfer instruction
  const instruction = SystemProgram.transfer({
    fromPubkey: fromPubkeyPubKey,
    toPubkey: toPubkeyPubKey,
    lamports
  });

  return instruction;
}

// Generate create token account instruction
async function generateCreateTokenAccountInstruction(params: any): Promise<TransactionInstruction> {
  const { payer, owner, tokenMint } = params;

  // Validate required parameters
  if (!payer || !owner || !tokenMint) {
    throw new Error('Missing required parameters for create token account: payer, owner, tokenMint');
  }

  // Validate public keys
  let payerPubKey: PublicKey;
  let ownerPubKey: PublicKey;
  let mintPubKey: PublicKey;

  try {
    payerPubKey = new PublicKey(payer);
    ownerPubKey = new PublicKey(owner);
    mintPubKey = new PublicKey(tokenMint);
  } catch (error) {
    throw new Error('Invalid public key format in create token account parameters');
  }

  // Get the associated token account address
  const associatedTokenAccount = await getAssociatedTokenAddress(
    mintPubKey,
    ownerPubKey,
    false
  );

  // Create the create associated token account instruction
  const instruction = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payerPubKey, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: ownerPubKey, isSigner: false, isWritable: false },
      { pubkey: mintPubKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([]) // Create instruction has no data
  });

  return instruction;
}

// Helper function to serialize instruction data to Base64
export function serializeInstructionToBase64(instruction: TransactionInstruction): string {
  // Create a buffer to hold the serialized instruction
  const buffers: Buffer[] = [];
  
  // Add program ID (32 bytes)
  buffers.push(instruction.programId.toBuffer());
  
  // Add accounts (variable length)
  const accountsBuffer = Buffer.alloc(4 + (instruction.keys.length * 34));
  let offset = 0;
  
  // Write number of accounts (4 bytes, little-endian)
  accountsBuffer.writeUInt32LE(instruction.keys.length, offset);
  offset += 4;
  
  // Write each account (32 bytes pubkey + 1 byte isSigner + 1 byte isWritable)
  for (const account of instruction.keys) {
    account.pubkey.toBuffer().copy(accountsBuffer, offset);
    offset += 32;
    accountsBuffer.writeUInt8(account.isSigner ? 1 : 0, offset);
    offset += 1;
    accountsBuffer.writeUInt8(account.isWritable ? 1 : 0, offset);
    offset += 1;
  }
  
  buffers.push(accountsBuffer);
  
  // Add data length (4 bytes, little-endian)
  const dataLengthBuffer = Buffer.alloc(4);
  dataLengthBuffer.writeUInt32LE(instruction.data.length, 0);
  buffers.push(dataLengthBuffer);
  
  // Add instruction data
  buffers.push(instruction.data);
  
  // Combine all buffers
  const serialized = Buffer.concat(buffers);
  
  return serialized.toString('base64');
}

// Helper function to decode Base64 instruction
export function createInstructionFromBase64(base64Instruction: string): TransactionInstruction {
  const instructionBuffer = Buffer.from(base64Instruction, 'base64');
  
  let offset = 0;
  
  // Read program ID (32 bytes)
  const programId = new PublicKey(instructionBuffer.slice(offset, offset + 32));
  offset += 32;
  
  // Read number of accounts (4 bytes, little-endian)
  const accountsLength = instructionBuffer.readUInt32LE(offset);
  offset += 4;
  
  // Read accounts
  const accounts: any[] = [];
  for (let i = 0; i < accountsLength; i++) {
    const pubkey = new PublicKey(instructionBuffer.slice(offset, offset + 32));
    offset += 32;
    const isSigner = instructionBuffer.readUInt8(offset) === 1;
    offset += 1;
    const isWritable = instructionBuffer.readUInt8(offset) === 1;
    offset += 1;
    accounts.push({ pubkey, isSigner, isWritable });
  }
  
  // Read data length (4 bytes, little-endian)
  const dataLength = instructionBuffer.readUInt32LE(offset);
  offset += 4;
  
  // Read data
  const data = instructionBuffer.slice(offset, offset + dataLength);
  
  return new TransactionInstruction({
    programId,
    keys: accounts,
    data
  });
}
