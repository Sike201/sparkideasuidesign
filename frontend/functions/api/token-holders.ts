import { Connection, PublicKey } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils'

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type TokenHolder = {
  address: string
  amount: number
  percentage: number
}

/**
 * GET /api/token-holders?mint=<TOKEN_MINT>
 *
 * Returns the top token holders for a given SPL token mint
 * using Solana's getTokenLargestAccounts RPC method.
 */
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const mint = searchParams.get('mint')

    if (!mint) {
      return jsonResponse({ success: false, error: 'mint parameter is required' }, 400)
    }

    let mintPubKey: PublicKey
    try {
      mintPubKey = new PublicKey(mint)
    } catch {
      return jsonResponse({ success: false, error: 'Invalid mint address' }, 400)
    }

    const rpcUrl = ctx.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
    const connection = new Connection(rpcUrl)

    // Fetch total supply
    const supplyResp = await connection.getTokenSupply(mintPubKey)
    const totalSupply = supplyResp.value.uiAmount ?? 0
    const decimals = supplyResp.value.decimals

    if (totalSupply === 0) {
      return jsonResponse({ success: true, holders: [], totalSupply: 0 }, 200)
    }

    // Fetch largest accounts (returns top 20 by default)
    const largestAccounts = await connection.getTokenLargestAccounts(mintPubKey)

    const holders: TokenHolder[] = largestAccounts.value
      .filter((a) => a.uiAmount && a.uiAmount > 0)
      .map((account) => {
        const amount = account.uiAmount ?? 0
        return {
          address: account.address.toBase58(),
          amount,
          percentage: totalSupply > 0 ? (amount / totalSupply) * 100 : 0,
        }
      })
      .sort((a, b) => b.amount - a.amount)

    // Resolve owner addresses for each token account
    const holdersWithOwners: TokenHolder[] = []
    for (const holder of holders) {
      try {
        const accountInfo = await connection.getParsedAccountInfo(new PublicKey(holder.address))
        const parsed = (accountInfo.value?.data as any)?.parsed
        const owner = parsed?.info?.owner
        if (owner) {
          holdersWithOwners.push({ ...holder, address: owner })
        } else {
          holdersWithOwners.push(holder)
        }
      } catch {
        holdersWithOwners.push(holder)
      }
    }

    return jsonResponse({
      success: true,
      holders: holdersWithOwners,
      totalSupply,
      decimals,
    }, 200)

  } catch (error) {
    console.error('[token-holders] Error:', error)
    await reportError(ctx.env.DB, error)
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
}
