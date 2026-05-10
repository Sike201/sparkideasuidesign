import { jsonResponse } from './cfPagesFunctionsUtils';

type ENV = {
  JUPITER_API_KEY: string;
};

/**
 * GET /api/token-price?mint=<token_mint_address>
 *
 * Tries Jupiter Price API v3 first, falls back to DexScreener.
 * Returns { price: number | null, source: string }
 */
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const mint = url.searchParams.get('mint');

  if (!mint) {
    return jsonResponse({ error: 'mint query parameter is required' }, 400);
  }

  // ── Try Jupiter first ──
  try {
    const jupUrl = `https://api.jup.ag/price/v3?ids=${mint}`;
    console.log(`[TOKEN-PRICE] Trying Jupiter: ${jupUrl}`);

    const jupResponse = await fetch(jupUrl, {
      headers: {
        'x-api-key': ctx.env.JUPITER_API_KEY || '',
      },
    });

    if (jupResponse.ok) {
      const data = await jupResponse.json() as Record<string, { usdPrice?: number; price?: string }>;
      const tokenData = data?.[mint];
      const price = tokenData?.usdPrice ?? (tokenData?.price ? Number(tokenData.price) : null);

      if (price != null) {
        console.log(`[TOKEN-PRICE] Jupiter price: ${price}`);
        return jsonResponse({ price, source: 'jupiter' });
      }
      console.log(`[TOKEN-PRICE] Jupiter returned no data for ${mint}, trying DexScreener...`);
    }
  } catch (error) {
    console.error('[TOKEN-PRICE] Jupiter error:', error);
  }

  // ── Fallback: DexScreener ──
  try {
    const dexUrl = `https://api.dexscreener.com/tokens/v1/solana/${mint}`;
    console.log(`[TOKEN-PRICE] Trying DexScreener: ${dexUrl}`);

    const dexResponse = await fetch(dexUrl);

    if (dexResponse.ok) {
      const pairs = await dexResponse.json() as Array<{ priceUsd?: string }>;

      if (Array.isArray(pairs) && pairs.length > 0 && pairs[0].priceUsd) {
        const price = Number(pairs[0].priceUsd);
        console.log(`[TOKEN-PRICE] DexScreener price: ${price}`);
        return jsonResponse({ price, source: 'dexscreener' });
      }
      console.log(`[TOKEN-PRICE] DexScreener returned no pairs for ${mint}`);
    }
  } catch (error) {
    console.error('[TOKEN-PRICE] DexScreener error:', error);
  }

  console.log(`[TOKEN-PRICE] No price found for ${mint}`);
  return jsonResponse({ price: null, source: null });
};
