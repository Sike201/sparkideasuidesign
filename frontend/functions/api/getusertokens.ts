import { Connection, PublicKey } from "@solana/web3.js";
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { drizzle } from "drizzle-orm/d1";

type ENV = {
  RPC_URL: string;
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE?: string;
}

type TokenMetadata = {
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  uri?: string;
  logoURI?: string;
}

type UserToken = {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  metadata: TokenMetadata;
}

// Known fungible tokens registry (these are definitely not NFTs)
const KNOWN_FUNGIBLE_TOKENS: Record<string, TokenMetadata> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    name: "USD Coin",
    symbol: "USDC",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    name: "USDT",
    symbol: "USDT",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png"
  },
  "So11111111111111111111111111111111111111112": {
    name: "Wrapped SOL",
    symbol: "SOL",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
  },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {
    name: "Marinade staked SOL",
    symbol: "mSOL",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png"
  },
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
    name: "Wrapped Ethereum",
    symbol: "WETH",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png"
  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    name: "Raydium",
    symbol: "RAY",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png"
  },
  "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt": {
    name: "Serum",
    symbol: "SRM",
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt/logo.png"
  },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
    name: "Bonk",
    symbol: "BONK",
    image: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I"
  },
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": {
    name: "Popcat",
    symbol: "POPCAT",
    image: "https://dd.dexscreener.com/ds-data/tokens/solana/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr.png"
  }
};

/**
 * Check if a token is likely an NFT based on various criteria
 */
async function isLikelyNFT(connection: Connection, mint: PublicKey, tokenAccount: any): Promise<boolean> {
  const mintString = mint.toBase58();
  
  // 1. If it's in our known fungible tokens list, it's definitely not an NFT
  if (KNOWN_FUNGIBLE_TOKENS[mintString]) {
    return false;
  }
  
  // 2. Check token supply - NFTs typically have supply of 1
  try {
    const mintInfo = await connection.getTokenSupply(mint);
    const supply = BigInt(mintInfo.value.amount);
    
    // If supply is 1 and decimals is 0, it's likely an NFT
    if (supply === 1n && mintInfo.value.decimals === 0) {
      return true;
    }
    
    // If supply is very low (< 1000) and decimals is 0, might be NFT
    if (supply < 1000n && mintInfo.value.decimals === 0) {
      return true;
    }
  } catch (error) {
    console.warn(`Failed to get token supply for ${mintString}:`, error);
  }
  
  // 3. Check if token has Metaplex metadata (common for NFTs)
  try {
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    if (metadataAccount) {
      // Parse basic metadata to check for NFT characteristics
      const metadata = parseBasicMetadata(metadataAccount.data);
      
      // NFTs often have specific naming patterns or no symbol
      if (metadata.name && !metadata.symbol) {
        return true;
      }
      
      // Check for NFT-like names (containing #, numbers at end, etc.)
      if (metadata.name && /#\d+$/.test(metadata.name)) {
        return true;
      }
    }
  } catch (error) {
    // If metadata check fails, continue with other checks
  }
  
  // 4. Check user's balance - if they own exactly 1 token, might be NFT
  const parsedInfo = tokenAccount.account.data.parsed?.info;
  if (parsedInfo && parsedInfo.tokenAmount.decimals === 0 && parsedInfo.tokenAmount.uiAmount === 1) {
    return true;
  }
  
  return false;
}

/**
 * Parse basic metadata from account data
 */
function parseBasicMetadata(data: Buffer): { name?: string; symbol?: string } {
  try {
    let offset = 1; // Skip the key byte
    offset += 32; // Skip update authority
    offset += 32; // Skip mint
    
    // Parse name
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    
    if (nameLength > 0 && nameLength < 200 && offset + nameLength <= data.length) {
      const nameBytes = data.slice(offset, offset + nameLength);
      const name = nameBytes.toString('utf8').replace(/\0/g, '').trim();
      offset += nameLength;
      
      // Parse symbol
      const symbolLength = data.readUInt32LE(offset);
      offset += 4;
      
      let symbol = '';
      if (symbolLength > 0 && symbolLength < 50 && offset + symbolLength <= data.length) {
        const symbolBytes = data.slice(offset, offset + symbolLength);
        symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim();
      }
      
      return { name: name || undefined, symbol: symbol || undefined };
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return {};
}

/**
 * Get token metadata from Jupiter API (reliable source for fungible tokens)
 */
async function getJupiterTokenList(): Promise<Record<string, TokenMetadata>> {
  try {
    console.log("Fetching Jupiter token list...");
    const response = await fetch("https://token.jup.ag/strict", {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const tokens = await response.json() as Array<{
      address: string;
      name: string;
      symbol: string;
      logoURI?: string;
      decimals: number;
    }>;
    
    const tokenMap: Record<string, TokenMetadata> = {};
    tokens.forEach(token => {
      tokenMap[token.address] = {
        name: token.name,
        symbol: token.symbol,
        image: token.logoURI
      };
    });
    
    console.log(`Loaded ${tokens.length} tokens from Jupiter`);
    return tokenMap;
  } catch (error) {
    console.error("Failed to fetch Jupiter token list:", error);
    return {};
  }
}

/**
 * Get metadata for a token with fallback strategies
 */
async function getTokenMetadata(
  mintString: string, 
  jupiterTokens: Record<string, TokenMetadata>
): Promise<TokenMetadata> {
  // 1. Check known fungible tokens first
  if (KNOWN_FUNGIBLE_TOKENS[mintString]) {
    return KNOWN_FUNGIBLE_TOKENS[mintString];
  }
  
  // 2. Check Jupiter token list (most reliable for fungible tokens)
  if (jupiterTokens[mintString]) {
    return jupiterTokens[mintString];
  }
  
  // 3. Fallback to basic token info
  return {
    name: `${mintString.slice(0, 3)}..${mintString.slice(-3)}`,
    symbol: mintString.slice(0, 4).toUpperCase()
  };
}

/**
 * Filter and process user tokens to exclude NFTs
 */
async function processUserTokens(
  connection: Connection,
  tokenAccounts: any[],
  jupiterTokens: Record<string, TokenMetadata>
): Promise<UserToken[]> {
  const validTokens: UserToken[] = [];
  
  console.log(`Processing ${tokenAccounts.length} token accounts...`);
  
  // Import rate limiting utilities
  const { processBatch, RateLimiter } = await import('./rateLimit');
  
  // Create rate limiter for this operation (2 requests per second to be conservative)
  const rateLimiter = new RateLimiter(2);
  
  // Process tokens using enhanced batch processing with rate limiting
  const processToken = async (tokenAccount: any) => {
    try {
      const parsedInfo = tokenAccount.account.data.parsed?.info;
      if (!parsedInfo) return null;
      
      const amount = BigInt(parsedInfo.tokenAmount.amount);
      if (amount === 0n) return null; // Skip zero balance
      
      const mint = new PublicKey(parsedInfo.mint);
      const mintString = mint.toBase58();
      
      // Check if this is likely an NFT (with rate limiting)
      await rateLimiter.waitIfNeeded();
      const isNFT = await isLikelyNFT(connection, mint, tokenAccount);
      if (isNFT) {
        console.log(`Skipping NFT: ${mintString}`);
        return null;
      }
      
      // Get token metadata
      const metadata = await getTokenMetadata(mintString, jupiterTokens);
      
      return {
        mint: mintString,
        amount: amount.toString(),
        decimals: parsedInfo.tokenAmount.decimals,
        uiAmount: parsedInfo.tokenAmount.uiAmount || 0,
        metadata
      };
    } catch (error) {
      console.error(`Error processing token:`, error);
      return null;
    }
  };
  
  // Process in smaller batches with longer delays to prevent rate limiting
  const results = await processBatch(
    tokenAccounts,
    processToken,
    3, // Smaller batch size
    1500, // Longer delay between batches
    rateLimiter
  );
  
  validTokens.push(...results.filter(Boolean));
  
  // Sort by balance (highest first)
  validTokens.sort((a, b) => b.uiAmount - a.uiAmount);
  
  console.log(`Filtered to ${validTokens.length} fungible tokens`);
  return validTokens;
}

/**
 * Get relevant token mints from database (our project tokens)
 */
async function getRelevantTokenMints(db: D1Database): Promise<Set<string>> {
  try {
    const result = await db
      .prepare("SELECT DISTINCT mint FROM tokens WHERE mint IS NOT NULL AND mint != ''")
      .all();
    
    const mints = new Set<string>();
    
    // Add essential tokens that users definitely want to see
    mints.add("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
    mints.add("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"); // USDT
    mints.add("So11111111111111111111111111111111111111112"); // Wrapped SOL
    mints.add("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So"); // Marinade SOL
    mints.add("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"); // Ether
    
    // Add project tokens from database
    if (result.results) {
      for (const row of result.results) {
        if (row.mint) {
          mints.add(row.mint as string);
        }
      }
    }
    
    console.log(`Found ${mints.size} relevant token mints (${result.results?.length || 0} from database + 5 essential)`);
    return mints;
  } catch (error) {
    console.error("Error fetching relevant tokens from database:", error);
    // Return at least the essential tokens
    return new Set([
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
      "So11111111111111111111111111111111111111112", // Wrapped SOL
    ]);
  }
}

/**
 * Process only relevant tokens (no NFT checking needed for known tokens)
 */
async function processRelevantTokens(
  tokenAccounts: any[],
  jupiterTokens: Record<string, TokenMetadata>
): Promise<UserToken[]> {
  const validTokens: UserToken[] = [];
  
  console.log(`Processing ${tokenAccounts.length} relevant token accounts (skipping NFT checks)...`);
  
  for (const tokenAccount of tokenAccounts) {
    try {
      const parsedInfo = tokenAccount.account.data.parsed?.info;
      if (!parsedInfo) continue;
      
      const amount = BigInt(parsedInfo.tokenAmount.amount);
      if (amount === 0n) continue; // Skip zero balance
      
      const mint = parsedInfo.mint;
      
      // Get token metadata (no NFT checking needed for relevant tokens)
      const metadata = await getTokenMetadata(mint, jupiterTokens);
      
      validTokens.push({
        mint,
        amount: amount.toString(),
        decimals: parsedInfo.tokenAmount.decimals,
        uiAmount: parsedInfo.tokenAmount.uiAmount || 0,
        metadata
      });
    } catch (error) {
      console.error(`Error processing token:`, error);
    }
  }
  
  // Sort by balance (highest first)
  validTokens.sort((a, b) => b.uiAmount - a.uiAmount);
  
  console.log(`Processed ${validTokens.length} relevant tokens`);
  return validTokens;
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true });
  
  try {
    const url = new URL(ctx.request.url);
    const userAddress = url.searchParams.get('address');
    
    if (!userAddress) {
      return jsonResponse({ message: "User address parameter is required" }, 400);
    }

    // Validate the address format
    let userPubKey: PublicKey;
    try {
      userPubKey = new PublicKey(userAddress);
    } catch (error) {
      return jsonResponse({ message: "Invalid user address format" }, 400);
    }

    const connection = new Connection(ctx.env.RPC_URL);
    
    console.log(`Fetching tokens for user: ${userAddress}`);

    // Get relevant token mints and user's token accounts in parallel
    const [relevantMints, tokenAccountsResult, jupiterTokens] = await Promise.all([
      getRelevantTokenMints(ctx.env.DB),
      connection.getParsedTokenAccountsByOwner(userPubKey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // SPL Token Program
      }),
      getJupiterTokenList()
    ]);

    console.log(`Found ${tokenAccountsResult.value.length} total token accounts`);

    // Filter token accounts to only include relevant tokens (massive speed improvement)
    const relevantTokenAccounts = tokenAccountsResult.value.filter(tokenAccount => {
      const parsedInfo = tokenAccount.account.data.parsed?.info;
      if (!parsedInfo) return false;
      
      const mint = parsedInfo.mint;
      return relevantMints.has(mint);
    });

    console.log(`Filtered to ${relevantTokenAccounts.length} relevant token accounts (from ${tokenAccountsResult.value.length} total)`);

    // Process only relevant tokens (much faster - no NFT checking needed)
    const userTokens = await processRelevantTokens(
      relevantTokenAccounts, 
      jupiterTokens
    );

    // Get SOL balance
    const solBalance = await connection.getBalance(userPubKey);
    const solBalanceInSol = solBalance / 1e9;

    console.log(`Successfully processed ${userTokens.length} relevant tokens for ${userAddress} in optimized mode`);

    return jsonResponse({
      success: true,
      userAddress,
      solBalance: {
        mint: "So11111111111111111111111111111111111111112",
        amount: solBalance.toString(),
        decimals: 9,
        uiAmount: solBalanceInSol,
        metadata: {
          name: "Solana",
          symbol: "SOL",
          image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
        }
      },
      tokens: userTokens,
      tokenCount: userTokens.length
    }, 200);

  } catch (e) {
    console.error("Error fetching user tokens:", e);
    await reportError(ctx.env.DB, e);
    return jsonResponse({ message: "Something went wrong fetching user tokens..." }, 500);
  }
};

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    if (ctx.env.VITE_ENVIRONMENT_TYPE !== "develop") return;
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    return jsonResponse({ message: error }, 500);
  }
};