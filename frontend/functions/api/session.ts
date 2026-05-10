import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"
import jwt from "@tsndr/cloudflare-worker-jwt"


type ENV = {
  DB: D1Database
  VITE_ENVIRONMENT_TYPE: string
  AUTH_SESSIONS_STAGE: KVNamespace;
  AUTH_SESSIONS_PRODUCTION: KVNamespace;
  AUTH_SESSION_DEVELOP: KVNamespace;
  JWT_SECRET: string
}
export const onRequestGet: PagesFunction<ENV> = async (ctx): Promise<Response> => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const { searchParams } = new URL(ctx.request.url)
    const sessionId = searchParams.get("sessionId")

    // validate request
    if (!sessionId) {
      return jsonResponse({
        message: 'Missing sessionId!'
      }, 400)
    }

    // @TODO - KV namespace is chosen as per VITE_ENVIRONMENT_TYPE
    // Fetch the data from KV
    // const kvStore = ctx.env.AUTH_SESSION_DEVELOP;
    const kvStore = ctx.env.VITE_ENVIRONMENT_TYPE === 'develop' ? ctx.env.AUTH_SESSIONS_STAGE : ctx.env.AUTH_SESSIONS_PRODUCTION;
    const data = await kvStore.get(sessionId);
    if (!data) {
        return jsonResponse({
            message: 'Session not found or expired!'
        }, 404)
    }
    const { analyst } = JSON.parse(data) 

    // Create a JWT token
    const token = await jwt.sign({
        sub: analyst.id,
        name: analyst.twitterId,
        exp: Math.floor(Date.now() / 1000) + (60 * 15), // Token expires in 15 min
      }, ctx.env.JWT_SECRET)

    // Delete the KV entry after retrieval    
    await kvStore.delete(sessionId);

    // return result
    return jsonResponse({ analyst, token}, {
        statusCode: 200,
        headers: { 
          "Cache-Control": "no-store"
        }
      })
  } catch (e) {
    await reportError(db, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    if (ctx.env.VITE_ENVIRONMENT_TYPE !== "develop") return
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173', // Adjusted this for frontend origin
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}
