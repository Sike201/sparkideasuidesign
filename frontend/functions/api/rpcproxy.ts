import { z } from "zod"
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { getRpcUrlForCluster } from "../../shared/solana/rpcUtils"

const allowedMethods = [
  "getSignatureStatuses",
  "getBlockHeight",
  "simulateTransaction",
  "getMultipleAccounts",
  "getAccountInfo",
  "getTokenAccountsByOwner",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  'sendTransaction'
]

const RpcSchema = z.object({
  id: z.string(),
  jsonrpc: z.string(),
  method: z.string(),
  params: z.unknown(),
})

type ENV = {
  DB: D1Database
  SOLANA_RPC_URL: string
}
export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    const cluster = new URL(ctx.request.url).searchParams.get("cluster")
    if (!['devnet', 'mainnet'].includes(cluster)) {
      return jsonResponse({ message: `Unsupported cluster (${cluster})!`}, 409)
    }

    const solanaRpcUrl = getRpcUrlForCluster(ctx.env.SOLANA_RPC_URL, cluster)

    //// validate request
    const requestJson = await ctx.request.json()
    const { error, data } = RpcSchema.safeParse(requestJson)

    if (error) {
      return jsonResponse(null, 400)
    }

    const rpcMethod = data?.method || ''

    if (!allowedMethods.includes(rpcMethod)) {
      return jsonResponse({ message: `Method not allowed (${rpcMethod})!` }, 403)
    }

    //// happy flow
    const request = new Request(solanaRpcUrl, {
      method: 'post',
      body: JSON.stringify(data),
    })

    const rpcResponse = await fetch(request)
    const responseJson = await rpcResponse.json() as Record<string, unknown>
    const response = {
      cluster,
      ...responseJson,
    }
    if (responseJson?.error) {
      console.log(responseJson?.error);
      return jsonResponse(response, 400)
    }

    return jsonResponse(response, rpcResponse.status)
  } catch (e) {
    await reportError(db, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173', // Adjust this to frontends origin
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Solana-Client',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}
