import { z } from "zod"
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { getRpcUrlForCluster } from "../../shared/solana/rpcUtils"

const SimulateTransactionSchema = z.object({
  transaction: z.string(), // Base64 encoded transaction
  cluster: z.string().optional().default("mainnet")
})

type ENV = {
  DB: D1Database
  RPC_URL: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    console.log('SimulateTransaction: Starting request processing')
    
    const requestJson = await ctx.request.json()
    console.log('SimulateTransaction: Request JSON parsed:', { 
      hasTransaction: !!(requestJson as any).transaction, 
      cluster: (requestJson as any).cluster,
      transactionLength: (requestJson as any).transaction?.length 
    })
    
    const { error, data } = SimulateTransactionSchema.safeParse(requestJson)

    if (error) {
      console.error('SimulateTransaction: Validation error:', error)
      return jsonResponse({ 
        success: false, 
        error: `Invalid request format: ${error.message}` 
      }, 400)
    }

    const { transaction, cluster } = data

    if (!['devnet', 'mainnet'].includes(cluster)) {
      console.error('SimulateTransaction: Unsupported cluster:', cluster)
      return jsonResponse({ 
        success: false, 
        error: `Unsupported cluster: ${cluster}` 
      }, 400)
    }

    if (!ctx.env.RPC_URL) {
      console.error('SimulateTransaction: RPC_URL environment variable not set')
      return jsonResponse({ 
        success: false, 
        error: 'RPC configuration error' 
      }, 500)
    }

    const solanaRpcUrl = getRpcUrlForCluster(ctx.env.RPC_URL, cluster)
    console.log('SimulateTransaction: Using RPC URL:', solanaRpcUrl)

    // Create RPC request for simulateTransaction
    const rpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: [
        transaction,
        {
          encoding: "base64",
          commitment: "confirmed"
        }
      ]
    }

    // Send request to Solana RPC
    console.log('SimulateTransaction: Sending RPC request to:', solanaRpcUrl)
    console.log('SimulateTransaction: RPC request body:', JSON.stringify(rpcRequest, null, 2))
    
    const rpcResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest)
    })

    console.log('SimulateTransaction: RPC response status:', rpcResponse.status, rpcResponse.statusText)

    if (!rpcResponse.ok) {
      const errorText = await rpcResponse.text()
      console.error('SimulateTransaction: RPC request failed:', errorText)
      return jsonResponse({ 
        success: false, 
        error: `RPC request failed: ${rpcResponse.status} ${rpcResponse.statusText} - ${errorText}` 
      }, 500)
    }

    const rpcResult = await rpcResponse.json()
    console.log('SimulateTransaction: RPC result received:', JSON.stringify(rpcResult, null, 2))

    if ((rpcResult as any).error) {
      return jsonResponse({ 
        success: false, 
        error: `RPC error: ${(rpcResult as any).error.message || 'Unknown RPC error'}`,
        logs: (rpcResult as any).result?.logs || []
      }, 400)
    }

    // Check if simulation was successful
    const simulationResult = (rpcResult as any).result
    const hasError = simulationResult.value.err !== null

    return jsonResponse({
      success: true,
      valid: !hasError,
      error: hasError ? `Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}` : undefined,
      logs: simulationResult.value.logs || []
    })

  } catch (e) {
    await reportError(db, e)
    return jsonResponse({ 
      success: false, 
      error: "Internal server error" 
    }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}
