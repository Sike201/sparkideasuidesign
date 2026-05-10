import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  VITE_ENVIRONMENT_TYPE?: string
}

type GitHubTokenRequest = {
  code: string
  redirect_uri: string
}

type GitHubTokenResponse = {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    console.log('=== GitHub OAuth Token Exchange Request ===')
    
    const requestBody = await ctx.request.json() as any
    const { code, redirect_uri }: GitHubTokenRequest = requestBody
    
    console.log('Request details:', { 
      code: code ? `${code.substring(0, 10)}...` : 'missing', 
      redirect_uri,
      bodyKeys: Object.keys(requestBody)
    })

    // Validate required fields
    if (!code || !redirect_uri) {
      console.error('❌ Missing required fields:', { code: !!code, redirect_uri: !!redirect_uri })
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    // Validate environment variables
    console.log('Checking environment variables...')
    const hasClientId = !!ctx.env.GITHUB_CLIENT_ID
    const hasClientSecret = !!ctx.env.GITHUB_CLIENT_SECRET
    
    console.log('Environment check:', { 
      clientId: hasClientId ? `${ctx.env.GITHUB_CLIENT_ID.substring(0, 8)}...` : 'missing',
      clientSecret: hasClientSecret ? 'present' : 'missing'
    })
    
    if (!hasClientId || !hasClientSecret) {
      console.error('❌ GitHub OAuth environment variables not configured:', { 
        clientId: hasClientId, 
        clientSecret: hasClientSecret 
      })
      return jsonResponse({ message: "GitHub OAuth not configured" }, 500)
    }

    console.log('✅ Environment variables are present')
    console.log('Making request to GitHub token endpoint...')

    // Prepare GitHub request
    const githubRequestBody = {
      client_id: ctx.env.GITHUB_CLIENT_ID,
      client_secret: ctx.env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: redirect_uri,
    }
    
    console.log('GitHub request details:', {
      client_id: githubRequestBody.client_id,
      redirect_uri: githubRequestBody.redirect_uri,
      code: `${githubRequestBody.code.substring(0, 10)}...`
    })

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(githubRequestBody),
    })

    console.log('GitHub response status:', tokenResponse.status, tokenResponse.statusText)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('❌ GitHub token exchange failed:', { 
        status: tokenResponse.status, 
        statusText: tokenResponse.statusText,
        error: errorText.substring(0, 500) // Limit error text length
      })
      return jsonResponse({ 
        message: "Failed to exchange code for token", 
        details: errorText,
        status: tokenResponse.status 
      }, 400)
    }

    const tokenData: GitHubTokenResponse = await tokenResponse.json()
    console.log('GitHub token response received:', { 
      hasAccessToken: !!tokenData.access_token, 
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      error: tokenData.error 
    })
    
    if (tokenData.error) {
      console.error('❌ GitHub OAuth error response:', tokenData)
      return jsonResponse({ message: tokenData.error_description || "OAuth error" }, 400)
    }

    console.log('✅ Token exchange successful! Fetching user info...')

    // Fetch user info using the access token
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Spark-Hackathons',
      },
    })

    if (!userResponse.ok) {
      const userErrorText = await userResponse.text()
      console.error('❌ Failed to fetch GitHub user info:', {
        status: userResponse.status,
        error: userErrorText.substring(0, 500)
      })
      return jsonResponse({ message: "Failed to fetch user info" }, 400)
    }

    const userData = await userResponse.json() as { id: number; login: string; name: string; avatar_url?: string }
    console.log('✅ GitHub user info:', { id: userData.id, login: userData.login, name: userData.name })

    return jsonResponse({
      success: true,
      user: {
        id: userData.id,
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
      },
    }, 200)

  } catch (e) {
    console.error('❌ GitHub OAuth token exchange EXCEPTION:', {
      error: e instanceof Error ? e.message : 'Unknown error',
      stack: e instanceof Error ? e.stack : undefined
    })
    await reportError(ctx.env.DB, e)
    return jsonResponse({ 
      message: "Something went wrong during token exchange", 
      error: e instanceof Error ? e.message : 'Unknown error' 
    }, 500)
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