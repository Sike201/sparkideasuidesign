import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  VITE_ENVIRONMENT_TYPE?: string
}

type GoogleOAuthUrlRequest = {
  redirect_uri: string
  state: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { redirect_uri, state }: GoogleOAuthUrlRequest = await ctx.request.json()

    if (!redirect_uri || !state) {
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    if (!ctx.env.GOOGLE_CLIENT_ID) {
      return jsonResponse({ message: "Google OAuth not configured" }, 500)
    }

    const params = new URLSearchParams({
      client_id: ctx.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect_uri,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      access_type: 'online',
      prompt: 'select_account',
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return jsonResponse({ authUrl }, 200)

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
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}
