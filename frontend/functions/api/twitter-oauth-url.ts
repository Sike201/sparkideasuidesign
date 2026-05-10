import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  TWITTER_CLIENT_ID: string
  VITE_ENVIRONMENT_TYPE?: string
}

type TwitterOAuthUrlRequest = {
  redirect_uri: string
  state: string
  code_challenge: string
  code_challenge_method: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { redirect_uri, state, code_challenge, code_challenge_method }: TwitterOAuthUrlRequest = await ctx.request.json()

    // Validate required fields
    if (!redirect_uri || !state || !code_challenge || !code_challenge_method) {
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    // Validate environment variables
    if (!ctx.env.TWITTER_CLIENT_ID) {
      return jsonResponse({ message: "Twitter OAuth not configured" }, 500)
    }

    // Generate OAuth URL using backend environment variables
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.env.TWITTER_CLIENT_ID,
      redirect_uri: redirect_uri,
      scope: 'tweet.read users.read offline.access',
      state: state,
      code_challenge: code_challenge,
      code_challenge_method: code_challenge_method
    })
    
    // Use `twitter.com` (not `x.com`) so Android doesn't intercept this URL
    // via the X app's Android App Links claim on `x.com`. When the X app is
    // installed, `window.location.href = "https://x.com/i/oauth2/authorize..."`
    // opens the native app — which has no OAuth consent UI and never redirects
    // back to our callback, so the mobile flow just dies.
    //
    // `twitter.com/i/oauth2/authorize` still serves the OAuth2 consent screen
    // (Twitter 301s to x.com server-side if needed, and HTTP redirects stay
    // inside the browser rather than re-triggering Android intent resolution).
    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

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