import { AdminAuthFields } from "../../../shared/models"
import { authSchema } from "../../../shared/schemas/analysis-schema"
import { checkAdminAuthorization, isAdminReturnValue } from "../../services/authService"
import { jsonResponse, reportError } from "../cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"

type ENV = {
  DB: D1Database
  ADMIN_ADDRESSES: string
  VITE_ENVIRONMENT_TYPE: "develop" | "production" 
}
export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
      //// validate request
      const requestJson = await ctx.request.json()
      const { error, data } = authSchema.safeParse(requestJson)
    
     // check if user is admin
    const authResult: isAdminReturnValue = checkAdminAuthorization({ ctx, auth: data as AdminAuthFields })
    if (!authResult.isAdmin) {
        const { error: authError } = authResult as { error: { code: number; message: string }, isAdmin: false }
        await reportError(db, new Error(authError.message))
        return jsonResponse({ message: "Unauthorized!" }, authError.code)
    }

    // @TODO if we want to protect api request with jwt validation this is the place where we can return jwt as a 'HttpOnly' cookie

    return jsonResponse({ message: "Authorized!" }, 200)
  } catch (e) {
    await reportError(ctx.env.DB, e)
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
