import { Connection, PublicKey } from '@solana/web3.js';
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { isApiKeyValid } from '../services/apiKeyService';
import { serializeInstructionToBase64 } from './generateinstruction';

type ENV = {
  RPC_URL: string;
  DB: D1Database;
  JUPITER_API_KEY?: string; // Optional Jupiter API key for higher rate limits
}

interface GenerateSwapInstructionRequest {
  // Token information
  inputMint: string; // The mint address of the token you want to swap FROM
  outputMint: string; // The mint address of the token you want to swap TO
  amount: string; // Amount of input token to swap (in smallest unit, e.g., lamports for SOL)
  
  // User information
  userPublicKey: string; // The user's wallet public key
  
  // Optional parameters
  slippageBps?: number; // Slippage tolerance in basis points (default: 50 = 0.5%)
  maxAccounts?: number; // Maximum number of accounts in the transaction (default: 64)
  asLegacyTransaction?: boolean; // Whether to use legacy transaction format (default: false)
  dynamicComputeUnitLimit?: boolean; // Whether to use dynamic compute unit limit (default: true)
  prioritizationFeeLamports?: number; // Priority fee in lamports (default: 0)
  singleInstruction?: boolean; // Whether to return only the main swap instruction (default: false)
  avoidALTs?: boolean; // Whether to avoid Address Lookup Tables by limiting maxAccounts (default: false)
}

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      amm: {
        id: string;
        label: string;
        inputMint: string;
        inAmount: string;
        outputMint: string;
        outAmount: string;
        notEnoughLiquidity: boolean;
        minInAmount: string;
        minOutAmount: string;
        priceImpactPct: string;
        lpFee: {
          amount: string;
          mint: string;
        };
        platformFee: {
          amount: string;
          mint: string;
        };
      };
      percent: number;
    };
  }>;
  contextSlot: number;
  timeTaken: number;
}

interface JupiterSwapInstructionsResponse {
  tokenLedgerInstruction?: any;
  computeBudgetInstructions: Array<{
    programId: string;
    accounts: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: string;
  }>;
  setupInstructions: Array<{
    programId: string;
    accounts: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: string;
  }>;
  swapInstruction: {
    programId: string;
    accounts: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: string;
  };
  cleanupInstruction?: {
    programId: string;
    accounts: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: string;
  };
  addressLookupTableAddresses: string[];
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  addressLookupTableAddresses?: string[];
  simulationError?: any;
}

interface GenerateSwapInstructionResponse {
  success: boolean;
  base64Instructions?: {
    computeBudget: string;
    setup: string[];
    swap: string;
    cleanup?: string;
  };
  base64Instruction?: string; // Single instruction when singleInstruction=true
  swapTransaction?: string; // Pre-built transaction from Jupiter
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  quoteInfo?: {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: string;
    slippageBps: number;
  };
  addressLookupTableAddresses?: string[];
  error?: string;
  [key: string]: any; // Index signature for flexibility
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    // Authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
    //   return jsonResponse(null, 401);
    // }

    const requestBody = await ctx.request.json() as GenerateSwapInstructionRequest;
    
    // Validate required fields
    const requiredFields = ['inputMint', 'outputMint', 'amount', 'userPublicKey'];
    for (const field of requiredFields) {
      if (!requestBody[field as keyof GenerateSwapInstructionRequest]) {
        return jsonResponse({
          success: false,
          error: `Missing required field: ${field}`
        }, 400);
      }
    }

    // Validate PublicKey addresses
    try {
      new PublicKey(requestBody.inputMint);
      new PublicKey(requestBody.outputMint);
      new PublicKey(requestBody.userPublicKey);
    } catch (error) {
      return jsonResponse({
        success: false,
        error: 'Invalid PublicKey format in one or more addresses'
      }, 400);
    }

    // Validate amount
    const amount = BigInt(requestBody.amount);
    if (amount <= 0) {
      return jsonResponse({
        success: false,
        error: 'Amount must be greater than 0'
      }, 400);
    }

    // Set default values
    const slippageBps = requestBody.slippageBps || 50; // 0.5% default
    const maxAccounts = requestBody.maxAccounts || 64;
    const asLegacyTransaction = requestBody.asLegacyTransaction || false;
    const dynamicComputeUnitLimit = requestBody.dynamicComputeUnitLimit !== false; // Default true
    const prioritizationFeeLamports = requestBody.prioritizationFeeLamports || 0;
    const singleInstruction = requestBody.singleInstruction || false;

    console.log('[Jupiter Swap] Generating swap instruction with parameters:', {
      inputMint: requestBody.inputMint,
      outputMint: requestBody.outputMint,
      amount: requestBody.amount,
      userPublicKey: requestBody.userPublicKey,
      slippageBps,
      maxAccounts,
      singleInstruction
    });

    // Initialize connection for balance check
    const connection = new Connection(ctx.env.RPC_URL, 'confirmed');
    
    // Check if user has sufficient balance for the swap
    try {
      const userPublicKey = new PublicKey(requestBody.userPublicKey);
      const inputMint = new PublicKey(requestBody.inputMint);
      
      if (inputMint.equals(new PublicKey("So11111111111111111111111111111111111111112"))) {
        // Check SOL balance
        const balance = await connection.getBalance(userPublicKey);
        const requiredLamports = BigInt(requestBody.amount);
        
        if (balance < requiredLamports) {
          return jsonResponse({
            success: false,
            error: `Insufficient SOL balance. Required: ${Number(requiredLamports) / 1e9} SOL, Available: ${balance / 1e9} SOL`
          }, 400);
        }
        
        console.log('[Jupiter Swap] SOL balance check passed:', {
          required: Number(requiredLamports) / 1e9,
          available: balance / 1e9
        });
      }
    } catch (balanceError) {
      console.log('[Jupiter Swap] Balance check failed, proceeding anyway:', balanceError);
    }

    // Step 1: Get quote from Jupiter
    console.log('[Jupiter Swap] Getting quote from Jupiter...');
    const quoteUrl = 'https://quote-api.jup.ag/v6/quote';
    const quoteParams = new URLSearchParams({
      inputMint: requestBody.inputMint,
      outputMint: requestBody.outputMint,
      amount: requestBody.amount,
      slippageBps: slippageBps.toString(),
      maxAccounts: maxAccounts.toString(),
      asLegacyTransaction: asLegacyTransaction.toString()
    });

    // If user wants to avoid ALTs, use a much smaller maxAccounts
    if (requestBody.avoidALTs || maxAccounts <= 20) {
      quoteParams.set('maxAccounts', '8'); // Force ultra-simple legacy transaction
      quoteParams.set('asLegacyTransaction', 'true');
      console.log('[Jupiter Swap] Avoiding ALTs by limiting maxAccounts to 8');
    }

    const quoteResponse = await fetch(`${quoteUrl}?${quoteParams}`);
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error('[Jupiter Swap] Quote API error:', errorText);
      return jsonResponse({
        success: false,
        error: `Failed to get quote from Jupiter: ${errorText}`
      }, 400);
    }

    const quote: JupiterQuoteResponse = await quoteResponse.json();
    console.log('[Jupiter Swap] Quote received:', {
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct,
      slippageBps: quote.slippageBps
    });

    // Step 2: Get swap transaction from Jupiter (pre-built, optimized)
    console.log('[Jupiter Swap] Getting swap transaction from Jupiter...');
    const swapUrl = 'https://quote-api.jup.ag/v6/swap';
    
    const swapBody = {
      quoteResponse: quote,
      userPublicKey: requestBody.userPublicKey,
      dynamicComputeUnitLimit,
      prioritizationFeeLamports,
      asLegacyTransaction: asLegacyTransaction
    };

    const swapResponse = await fetch(swapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ctx.env.JUPITER_API_KEY && { 'Authorization': `Bearer ${ctx.env.JUPITER_API_KEY}` })
      },
      body: JSON.stringify(swapBody)
    });

    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      console.error('[Jupiter Swap] Swap API error:', errorText);
      return jsonResponse({
        success: false,
        error: `Failed to get swap transaction from Jupiter: ${errorText}`
      }, 400);
    }

    const swapResult: JupiterSwapResponse = await swapResponse.json();
    console.log('[Jupiter Swap] Swap transaction received:', {
      hasSwapTransaction: !!swapResult.swapTransaction,
      lastValidBlockHeight: swapResult.lastValidBlockHeight,
      prioritizationFeeLamports: swapResult.prioritizationFeeLamports,
      computeUnitLimit: swapResult.computeUnitLimit
    });

    // Check if we got a valid swap transaction
    if (!swapResult.swapTransaction) {
      return jsonResponse({
        success: false,
        error: 'Jupiter did not return a valid swap transaction. This might be due to insufficient liquidity or network issues.'
      }, 400);
    }

    // Step 3: Return the pre-built transaction
    console.log('[Jupiter Swap] Returning pre-built swap transaction...');
    
    const response: GenerateSwapInstructionResponse = {
      success: true,
      quoteInfo: {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
        slippageBps: quote.slippageBps
      },
      swapTransaction: swapResult.swapTransaction,
      lastValidBlockHeight: swapResult.lastValidBlockHeight,
      prioritizationFeeLamports: swapResult.prioritizationFeeLamports,
      computeUnitLimit: swapResult.computeUnitLimit
    };

    // Include address lookup table addresses if available
    if (swapResult.addressLookupTableAddresses && swapResult.addressLookupTableAddresses.length > 0) {
      if (requestBody.avoidALTs || maxAccounts <= 20) {
        console.log('[Jupiter Swap] Skipping address lookup table addresses to avoid ALTs');
      } else {
        response.addressLookupTableAddresses = swapResult.addressLookupTableAddresses;
        console.log('[Jupiter Swap] Including address lookup table addresses:', swapResult.addressLookupTableAddresses);
      }
    }

    console.log('[Jupiter Swap] Successfully generated swap instructions');
    return jsonResponse(response);

  } catch (error) {
    console.error('[Jupiter Swap] Error generating swap instruction:', error);
    await reportError(ctx.env.DB, error);
    
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate swap instruction'
    }, 500);
  }
};

// GET endpoint for API documentation
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    return jsonResponse({
      success: true,
      documentation: {
        description: 'API for generating Jupiter swap instructions',
        usage: 'POST with token mints, amount, and user public key to get swap instructions',
        example: {
          inputMint: 'So11111111111111111111111111111111111111112', // SOL
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          amount: '1000000000', // 1 SOL in lamports
          userPublicKey: 'YOUR_WALLET_PUBLIC_KEY',
          slippageBps: 50, // 0.5% slippage (optional)
          maxAccounts: 64, // Max accounts in transaction (optional)
          prioritizationFeeLamports: 10000, // Priority fee (optional)
          singleInstruction: true, // Return only the main swap instruction (optional)
          avoidALTs: true // Avoid Address Lookup Tables by limiting maxAccounts (optional)
        },
        notes: [
          'Uses Jupiter Swap API for optimal routing across DEXes',
          'Returns pre-built swap transactions that are ready to execute',
          'Supports both legacy and versioned transactions',
          'When avoidALTs=true, forces legacy transactions with maxAccounts=8',
          'Pre-built transactions are optimized and handle all complexity automatically',
          'Amount should be in the smallest unit of the input token (e.g., lamports for SOL)',
          'Slippage is specified in basis points (50 = 0.5%)',
          'For complex swaps, use the returned swapTransaction directly instead of individual instructions'
        ],
        commonTokens: {
          SOL: 'So11111111111111111111111111111111111111112',
          USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
        }
      }
    }, 200);

  } catch (error) {
    console.error('[Jupiter Swap] Error in GET request:', error);
    await reportError(ctx.env.DB, error);
    
    return jsonResponse({
      success: false,
      error: 'Failed to get API information'
    }, 500);
  }
};
