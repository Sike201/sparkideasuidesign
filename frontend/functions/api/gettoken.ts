// src/pages/api/createToken.ts
import { eq } from "drizzle-orm"
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"
import { tokensTable } from "../../shared/drizzle-schema"

type ENV = {
  VITE_ENVIRONMENT_TYPE: string
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const { searchParams } = new URL(ctx.request.url)
    const mint = searchParams.get("mint")

    const token = await db.select().from(tokensTable).where(eq(tokensTable.mint, mint))
    console.log("🔍 Token:", token)

    return jsonResponse({ token: token[0] }, 200)

  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
};

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    if (ctx.env.VITE_ENVIRONMENT_TYPE !== "develop") return
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173', // Adjusted this for frontend origin
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}

