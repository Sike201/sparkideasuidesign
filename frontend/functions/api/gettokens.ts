// src/pages/api/createToken.ts
import { eq, and, ne, isNotNull, or, isNull, desc, asc, sql } from "drizzle-orm"
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
    const isGraduated = searchParams.get("isGraduated")
    const orderBy = searchParams.get("orderBy") || "name" // Default to ordering by name
    const orderDirection = searchParams.get("orderDirection") || "asc" // Default to ascending

    // Validate required fields
    if (!isGraduated) {
      return jsonResponse({ message: 'Missing required fields' }, 400)
    }

    // Validate orderBy parameter
    const validOrderByFields = ["name", "fees_claimed", "dao", "mint"]
    if (!validOrderByFields.includes(orderBy)) {
      return jsonResponse({ message: 'Invalid orderBy field. Valid fields: ' + validOrderByFields.join(', ') }, 400)
    }

    // Validate orderDirection parameter
    const validOrderDirections = ["asc", "desc"]
    if (!validOrderDirections.includes(orderDirection)) {
      return jsonResponse({ message: 'Invalid orderDirection. Valid values: asc, desc' }, 400)
    }

    // Build the order clause
    let orderClause
    if (orderBy === "fees_claimed") {
      // For fees_claimed, we need to handle NULL values properly
      orderClause = orderDirection === "desc" 
        ? sql`CAST(fees_claimed AS REAL) DESC NULLS LAST`
        : sql`CAST(fees_claimed AS REAL) ASC NULLS FIRST`
    } else {
      // For other fields, use standard ordering
      const field = tokensTable[orderBy as keyof typeof tokensTable]
      orderClause = orderDirection === "desc" ? desc(field) : asc(field)
    }

    // Log the ordering being applied
    console.log(`=== ORDERING: ${orderBy} ${orderDirection.toUpperCase()} ===`)

    if (isGraduated === "all") {
      const tokens = await db
        .select()
        .from(tokensTable)
        .orderBy(orderClause)
        .all();
      
      // Log fees_claimed for each project
      console.log("=== ALL TOKENS ===")
      tokens.forEach(token => {
        console.log(`Project: ${token.name} | Mint: ${token.mint} | Fees Claimed: ${token.fees_claimed || 'NULL'}`)
      })
      
      return jsonResponse({ tokens }, 200)
    }

    // "Graduated" tokens are now tokens that have DAOs (non-null, non-empty dao field)
    if (isGraduated === "true") {
      const tokens = await db
        .select()
        .from(tokensTable)
        .where(and(
          isNotNull(tokensTable.dao),
          ne(tokensTable.dao, "")
        ))
        .orderBy(orderClause)
        .all();
      
      // Log fees_claimed for each graduated project
      console.log("=== GRADUATED TOKENS (with DAOs) ===")
      tokens.forEach(token => {
        console.log(`Project: ${token.name} | Mint: ${token.mint} | Fees Claimed: ${token.fees_claimed || 'NULL'} | User Fees Claimed: ${token.user_fees_claimed || 'NULL'} | DAO: ${token.dao}`)
      })
      
      return jsonResponse({ tokens }, 200)
    }

    // "Non-graduated" tokens are tokens without DAOs (null or empty dao field)  
    if (isGraduated === "false") {
      const tokens = await db
        .select()
        .from(tokensTable)
        .where(or(
          isNull(tokensTable.dao),
          eq(tokensTable.dao, "")
        ))
        .orderBy(orderClause)
        .all();
      
      // Log fees_claimed for each non-graduated project
      console.log("=== NON-GRADUATED TOKENS (without DAOs) ===")
      tokens.forEach(token => {
        console.log(`Project: ${token.name} | Mint: ${token.mint} | Fees Claimed: ${token.fees_claimed || 'NULL'} | DAO: ${token.dao || 'NULL'}`)
      })
      
      return jsonResponse({ tokens }, 200)
    }

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

