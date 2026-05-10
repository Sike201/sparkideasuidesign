import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { drizzle } from "drizzle-orm/d1";

type ENV = {
  RPC_URL: string;
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE?: string;
}

type TokenMarketData = {
  address: string;
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  fdv: number; // Fully Diluted Valuation
  priceChart: Array<{
    timestamp: number;
    price: number;
  }>;
  lastUpdated: string;
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true });
  try {
    const url = new URL(ctx.request.url);
    const tokenAddress = url.searchParams.get('address');
    
    if (!tokenAddress) {
      return jsonResponse({ message: "Token address parameter is required" }, 400);
    }

    console.log(`Fetching market data for token: ${tokenAddress}`);

    // Initialize response with defaults
    let tokenMarketData: TokenMarketData = {
      address: tokenAddress,
      name: "Unknown Token",
      symbol: "UNKNOWN",
      price: 0,
      priceChange24h: 0,
      marketCap: 0,
      volume24h: 0,
      liquidity: 0,
      fdv: 0,
      priceChart: [],
      lastUpdated: new Date().toISOString()
    };

    try {
      // First, try to get basic token info from Jupiter Price API V2
      const jupiterResponse = await fetch(`https://lite-api.jup.ag/price/v2?ids=${tokenAddress}`);
      if (jupiterResponse.ok) {
        const jupiterData = await jupiterResponse.json() as any;
        const tokenData = jupiterData.data?.[tokenAddress];
        
        if (tokenData && tokenData.price) {
          tokenMarketData.price = parseFloat(tokenData.price);
          console.log(`Jupiter Price API V2 for ${tokenAddress}: $${tokenData.price}`);
        }
      }
    } catch (error) {
      console.warn("Failed to fetch from Jupiter Price API V2:", error);
    }

    try {
      // Get more detailed market data from DexScreener
      const dexScreenerResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      if (dexScreenerResponse.ok) {
        const dexScreenerData = await dexScreenerResponse.json() as any;
        
        if (dexScreenerData.pairs && dexScreenerData.pairs.length > 0) {
          // Get the most liquid pair (usually first one)
          const mainPair = dexScreenerData.pairs[0];
          
          tokenMarketData.name = mainPair.baseToken.name || tokenMarketData.name;
          tokenMarketData.symbol = mainPair.baseToken.symbol || tokenMarketData.symbol;
          tokenMarketData.price = parseFloat(mainPair.priceUsd) || tokenMarketData.price;
          tokenMarketData.priceChange24h = parseFloat(mainPair.priceChange?.h24) || 0;
          tokenMarketData.volume24h = parseFloat(mainPair.volume?.h24) || 0;
          tokenMarketData.liquidity = parseFloat(mainPair.liquidity?.usd) || 0;
          tokenMarketData.marketCap = parseFloat(mainPair.marketCap) || 0;
          tokenMarketData.fdv = parseFloat(mainPair.fdv) || 0;
          
        }
      }
    } catch (error) {
      console.warn("Failed to fetch from DexScreener API:", error);
    }

    try {
      // Get historical price data for chart from Birdeye (if available)
      const birdeyeResponse = await fetch(
        `https://public-api.birdeye.so/defi/history_price?address=${tokenAddress}&address_type=token&type=1H&time_from=${Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60}&time_to=${Math.floor(Date.now() / 1000)}`,
        {
          headers: {
            'X-API-KEY': 'your-birdeye-api-key-here' // You'd need to get this from Birdeye
          }
        }
      );
      
      if (birdeyeResponse.ok) {
        const birdeyeData = await birdeyeResponse.json() as any;
        if (birdeyeData.data && birdeyeData.data.items) {
          tokenMarketData.priceChart = birdeyeData.data.items.map((item: any) => ({
            timestamp: item.unixTime * 1000,
            price: item.value
          }));
        }
      }
    } catch (error) {
      console.warn("Failed to fetch from Birdeye API:", error);
      
      // Generate mock chart data if no real data available
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      const mockChart = [];
      
      for (let i = 168; i >= 0; i--) { // 7 days of hourly data
        const timestamp = now - (i * oneHour);
        const randomVariation = (Math.random() - 0.5) * 0.1; // ±5% variation
        const price = tokenMarketData.price * (1 + randomVariation);
        mockChart.push({
          timestamp,
          price: Math.max(0, price)
        });
      }
      
      tokenMarketData.priceChart = mockChart;
    }

    try {
      // Try CoinGecko for market cap data if we don't have it yet
      if (tokenMarketData.marketCap === 0) {
        // Try to find the token on CoinGecko by searching for Solana tokens
        const geckoSearchResponse = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${tokenAddress}`
        );
        
        if (geckoSearchResponse.ok) {
          const searchData = await geckoSearchResponse.json() as any;
          
          // Look for Solana tokens in the search results
          if (searchData.coins && searchData.coins.length > 0) {
            const solanaToken = searchData.coins.find((coin: any) => 
              coin.platforms && coin.platforms.solana === tokenAddress
            );
            
            if (solanaToken) {
              // Get detailed market data for this token
              const geckoDetailResponse = await fetch(
                `https://api.coingecko.com/api/v3/coins/${solanaToken.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
              );
              
              if (geckoDetailResponse.ok) {
                const detailData = await geckoDetailResponse.json() as any;
                
                if (detailData.market_data) {
                  // Update market cap if available
                  if (detailData.market_data.market_cap && detailData.market_data.market_cap.usd) {
                    tokenMarketData.marketCap = detailData.market_data.market_cap.usd;
                    console.log(`CoinGecko market cap for ${tokenAddress}: $${tokenMarketData.marketCap}`);
                  }
                  
                  // Update price if we don't have it yet
                  if (tokenMarketData.price === 0 && detailData.market_data.current_price && detailData.market_data.current_price.usd) {
                    tokenMarketData.price = detailData.market_data.current_price.usd;
                    console.log(`CoinGecko price for ${tokenAddress}: $${tokenMarketData.price}`);
                  }
                  
                  // Update 24h change if available
                  if (detailData.market_data.price_change_percentage_24h) {
                    tokenMarketData.priceChange24h = detailData.market_data.price_change_percentage_24h;
                  }
                  
                  // Update volume if available
                  if (detailData.market_data.total_volume && detailData.market_data.total_volume.usd) {
                    tokenMarketData.volume24h = detailData.market_data.total_volume.usd;
                  }
                  
                  // Update name and symbol if we don't have them
                  if (tokenMarketData.name === "Unknown Token" && detailData.name) {
                    tokenMarketData.name = detailData.name;
                  }
                  if (tokenMarketData.symbol === "UNKNOWN" && detailData.symbol) {
                    tokenMarketData.symbol = detailData.symbol.toUpperCase();
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to fetch from CoinGecko API:", error);
    }

    // If we still don't have basic info, try to get it from on-chain metadata
    if (tokenMarketData.name === "Unknown Token") {
      try {
        // This would connect to Solana RPC and fetch token metadata
        // For now, we'll use the address as fallback
        tokenMarketData.name = `Token ${tokenAddress.slice(0, 8)}...`;
        tokenMarketData.symbol = tokenAddress.slice(0, 4).toUpperCase();
      } catch (error) {
        console.warn("Failed to fetch on-chain metadata:", error);
      }
    }

    try {
      // Try GeckoTerminal API as final fallback for market data
      if (tokenMarketData.marketCap === 0 || tokenMarketData.price === 0) {
        console.log("Trying GeckoTerminal API as fallback...");
        const geckoTerminalUrl = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`;
        const geckoResponse = await fetch(geckoTerminalUrl);
        
        if (geckoResponse.ok) {
          const geckoData = await geckoResponse.json() as any;
          console.log("GeckoTerminal data:", geckoData);
          
          if (geckoData.data && geckoData.data.attributes) {
            const attributes = geckoData.data.attributes;
            
            // Update market cap if available
            if (attributes.market_cap_usd) {
              tokenMarketData.marketCap = parseFloat(attributes.market_cap_usd);
              console.log(`GeckoTerminal market cap for ${tokenAddress}: $${tokenMarketData.marketCap}`);
            }
            
            // Update price if we don't have it yet
            if (tokenMarketData.price === 0 && attributes.price_usd) {
              tokenMarketData.price = parseFloat(attributes.price_usd);
              console.log(`GeckoTerminal price for ${tokenAddress}: $${tokenMarketData.price}`);
            }
            
            // Update FDV if available
            if (attributes.fdv_usd) {
              tokenMarketData.fdv = parseFloat(attributes.fdv_usd);
            }
            
            // Update volume if available
            if (attributes.volume_usd && attributes.volume_usd.h24) {
              tokenMarketData.volume24h = parseFloat(attributes.volume_usd.h24);
            }
            
            // Update name and symbol if we don't have them
            if (tokenMarketData.name === "Unknown Token" && attributes.name) {
              tokenMarketData.name = attributes.name;
            }
            if (tokenMarketData.symbol === "UNKNOWN" && attributes.symbol) {
              tokenMarketData.symbol = attributes.symbol;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to fetch from GeckoTerminal API:", error);
    }

    return jsonResponse({
      success: true,
      tokenMarketData
    }, 200);

  } catch (e) {
    console.error("Error fetching token market data:", e);
    await reportError(ctx.env.DB, e);
    return jsonResponse({ message: "Something went wrong fetching token market data..." }, 500);
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