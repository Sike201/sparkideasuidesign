import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"
import { applicationsTable } from "../../shared/drizzle-schema"
import { eq } from "drizzle-orm"
import { GitHubScoreCalculator } from "../../shared/services/githubScoreCalculator"
import { GitHubService } from "../../shared/services/githubService"

type ENV = {
  DB: D1Database
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  VITE_ENVIRONMENT_TYPE?: string
}

type GitHubScoreRequest = {
  githubUsername: string
  githubAccessToken: string
  applicationId?: string
}

type GitHubScoreResponse = {
  success: boolean
  githubScore?: number
  message: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const { githubUsername, githubAccessToken, applicationId }: GitHubScoreRequest = await ctx.request.json()

    // Validate required fields
    if (!githubUsername || !githubAccessToken) {
      return jsonResponse({ 
        success: false, 
        message: "Missing required fields: githubUsername and githubAccessToken" 
      }, 400)
    }

    console.log(`Calculating GitHub score for user: ${githubUsername}`)

    // Create GitHub service and calculator
    const githubService = new GitHubService(githubAccessToken)
    const calculator = new GitHubScoreCalculator(githubService)

    // Calculate GitHub score
    const scoreData = await calculator.calculateScore(githubUsername)
    const githubScore = scoreData.totalScore

    console.log(`GitHub score fetched successfully for ${githubUsername}: ${githubScore}`)

    // If applicationId is provided, update the application with the GitHub score only
    if (applicationId) {
      try {
        await ctx.env.DB
          .prepare("UPDATE applications SET github_score = ?, updated_at = ? WHERE id = ?")
          .bind(githubScore, new Date().toISOString(), applicationId)
          .run()

        console.log(`Updated application ${applicationId} with GitHub score: ${githubScore}`)
      } catch (updateError) {
        console.error('Failed to update application with GitHub score:', updateError)
        // Don't fail the entire request if the update fails
      }
    }

    return jsonResponse({
      success: true,
      githubScore,
      message: "GitHub score generated successfully"
    }, 200)

  } catch (e) {
    console.error('GitHub score generation error:', e)
    await reportError(ctx.env.DB, e)
    return jsonResponse({ 
      success: false, 
      message: "Something went wrong generating GitHub score..." 
    }, 500)
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const url = new URL(ctx.request.url)
    const applicationId = url.searchParams.get("applicationId")

    if (!applicationId) {
      return jsonResponse({ 
        success: false, 
        message: "Missing applicationId parameter" 
      }, 400)
    }

    // Get application with GitHub score
    const application = await ctx.env.DB
      .prepare("SELECT * FROM applications WHERE id = ?")
      .bind(applicationId as string)
      .first()

    if (!application) {
      return jsonResponse({ 
        success: false, 
        message: "Application not found" 
      }, 404)
    }

    return jsonResponse({
      success: true,
      application: {
        ...application
      }
    }, 200)

  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ 
      success: false, 
      message: "Something went wrong..." 
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
} 