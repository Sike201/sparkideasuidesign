import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  VITE_ENVIRONMENT_TYPE?: string
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const status = {
      githubClientIdConfigured: !!ctx.env.GITHUB_CLIENT_ID,
      githubClientSecretConfigured: !!ctx.env.GITHUB_CLIENT_SECRET,
      environment: ctx.env.VITE_ENVIRONMENT_TYPE || 'unknown',
      timestamp: new Date().toISOString(),
    }

    console.log('GitHub OAuth configuration status:', status)

    return jsonResponse(status, 200)
  } catch (e) {
    console.error('GitHub OAuth status check failed:', e)
    return jsonResponse({ message: "Something went wrong checking GitHub OAuth status" }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    if (ctx.env.VITE_ENVIRONMENT_TYPE !== "develop") return
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
} 