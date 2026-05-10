import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  GITHUB_CLIENT_ID: string
  VITE_ENVIRONMENT_TYPE?: string
}

type GitHubOAuthUrlRequest = {
  redirect_uri: string
  state: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { redirect_uri, state }: GitHubOAuthUrlRequest = await ctx.request.json()

    // Validate required fields
    if (!redirect_uri || !state) {
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    // Validate environment variables
    if (!ctx.env.GITHUB_CLIENT_ID) {
      return jsonResponse({ message: "GitHub OAuth not configured" }, 500)
    }

    // Generate OAuth URL using backend environment variables
    const params = new URLSearchParams({
      client_id: ctx.env.GITHUB_CLIENT_ID,
      redirect_uri: redirect_uri,
      scope: 'user:email',
      state: state,
      allow_signup: 'true'
    })
    
    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`

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