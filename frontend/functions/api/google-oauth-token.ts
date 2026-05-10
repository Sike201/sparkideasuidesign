import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  VITE_ENVIRONMENT_TYPE?: string
}

type GoogleOAuthTokenRequest = {
  code: string
  redirect_uri: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    console.log('[OAuth] Google token exchange starting...')
    const { code, redirect_uri }: GoogleOAuthTokenRequest = await ctx.request.json()

    if (!code || !redirect_uri) {
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) {
      return jsonResponse({ message: "Google OAuth not configured" }, 500)
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: ctx.env.GOOGLE_CLIENT_ID,
        client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[OAuth] Google token exchange failed:', errorText)
      return jsonResponse({ message: "Failed to exchange code", details: errorText }, 400)
    }

    const tokenData = await tokenResponse.json() as { access_token: string; id_token?: string }
    console.log('[OAuth] Google token received')

    // Fetch user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error('[OAuth] Google userinfo failed:', errorText)
      return jsonResponse({ message: "Failed to fetch user info" }, 400)
    }

    const user = await userResponse.json() as {
      id: string
      email: string
      name: string
      picture?: string
    }
    console.log('[OAuth] Google user:', { id: user.id, email: user.email, name: user.name })

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    }, 200)

  } catch (e) {
    console.error('[OAuth] Google token exchange error:', e)
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
