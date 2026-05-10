import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"
import { applicationsTable } from "../../shared/drizzle-schema"
import { eq, and, asc, desc } from "drizzle-orm"
import { nanoid } from "nanoid"
import { GitHubScoreCalculator } from "../../shared/services/githubScoreCalculator"
import { GitHubService } from "../../shared/services/githubService"

type ENV = {
  DB: D1Database
  VITE_ENVIRONMENT_TYPE?: string
}

type CreateApplicationRequest = {
  projectId: string
  githubUsername: string
  githubId: string
  deliverableName: string
  requestedPrice: number
  estimatedDeadline: string
  featureDescription: string
  solanaWalletAddress: string
  githubAccessToken?: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const applicationData: CreateApplicationRequest = await ctx.request.json()
    
    console.log('=== Application Submission ===')
    console.log('Application data received:', {
      projectId: applicationData.projectId,
      githubUsername: applicationData.githubUsername,
      hasGithubAccessToken: !!applicationData.githubAccessToken,
      tokenPrefix: applicationData.githubAccessToken ? `${applicationData.githubAccessToken.substring(0, 10)}...` : 'none'
    })

    // Validate required fields
    if (!applicationData.projectId || 
        !applicationData.githubUsername || 
        !applicationData.githubId ||
        !applicationData.deliverableName ||
        !applicationData.requestedPrice ||
        !applicationData.estimatedDeadline ||
        !applicationData.featureDescription ||
        !applicationData.solanaWalletAddress) {
      return jsonResponse({ message: "Missing required fields" }, 400)
    }

    // Check if user already has an application for this project
    const existingApplication = await db
      .select()
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.projectId, applicationData.projectId),
        eq(applicationsTable.githubId, applicationData.githubId)
      ))
      .get()

    if (existingApplication) {
      return jsonResponse({ message: "You already have an application for this project" }, 400)
    }

    // Create the application
    const applicationId = nanoid()
    const now = new Date().toISOString()

    await ctx.env.DB
      .prepare("INSERT INTO applications (id, project_id, github_username, github_id, deliverable_name, requested_price, estimated_deadline, feature_description, solana_wallet_address, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        applicationId,
        applicationData.projectId,
        applicationData.githubUsername,
        applicationData.githubId,
        applicationData.deliverableName,
        applicationData.requestedPrice,
        applicationData.estimatedDeadline,
        applicationData.featureDescription,
        applicationData.solanaWalletAddress,
        "pending",
        now,
        now
      )
      .run()

    // Fetch GitHub score if access token is provided
    let githubScore = null
    
    if (applicationData.githubAccessToken) {
      try {
        console.log(`Calculating GitHub score for user: ${applicationData.githubUsername}`)
        console.log(`GitHub access token provided: ${applicationData.githubAccessToken.substring(0, 10)}...`)
        
        // Create GitHub service and calculator
        const githubService = new GitHubService(applicationData.githubAccessToken)
        const calculator = new GitHubScoreCalculator(githubService)

        // Calculate GitHub score
        console.log('Starting GitHub score calculation...')
        const scoreData = await calculator.calculateScore(applicationData.githubUsername)
        githubScore = scoreData.totalScore
        
        console.log(`GitHub score calculated: ${githubScore}`)
        
        // Update the application with GitHub score only (no detailed data)
        await ctx.env.DB
          .prepare("UPDATE applications SET github_score = ?, updated_at = ? WHERE id = ?")
          .bind(githubScore, new Date().toISOString(), applicationId)
          .run()
        
        console.log(`Updated application ${applicationId} with GitHub score: ${githubScore}`)
      } catch (scoreError) {
        console.error('Error calculating GitHub score:', scoreError)
        console.error('Error details:', {
          message: scoreError instanceof Error ? scoreError.message : 'Unknown error',
          stack: scoreError instanceof Error ? scoreError.stack : undefined
        })
        // Don't fail the application creation if GitHub score calculation fails
      }
    } else {
      console.log('No GitHub access token provided, skipping score calculation')
    }

    return jsonResponse({ 
      success: true, 
      applicationId,
      githubScore,
      message: "Application submitted successfully" 
    }, 201)
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    const url = new URL(ctx.request.url)
    const projectId = url.searchParams.get("projectId")
    const githubId = url.searchParams.get("githubId")
    const sortBy = url.searchParams.get("sortBy") || "createdAt"
    const sortDirection = url.searchParams.get("sortDirection") || "desc"

    // Get the sort field
    const sortField = getSortField(sortBy)
    const orderBy = sortDirection === "asc" ? asc(sortField) : desc(sortField)

    let applications
    if (projectId) {
      // Get all applications for a specific project
      applications = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.projectId, projectId))
        .orderBy(orderBy)
        .all()
    } else if (githubId) {
      // Get all applications for a specific GitHub user
      applications = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.githubId, githubId))
        .orderBy(orderBy)
        .all()
    } else {
      // Get all applications (admin view)
      applications = await db
        .select()
        .from(applicationsTable)
        .orderBy(orderBy)
        .all()
    }

    console.log(applications)
    return jsonResponse({ applications }, 200)
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

// Helper function to map frontend sort field names to database columns
function getSortField(sortBy: string) {
  switch (sortBy) {
    case "githubUsername":
      return applicationsTable.githubUsername
    case "projectId":
      return applicationsTable.projectId
    case "deliverableName":
      return applicationsTable.deliverableName
    case "requestedPrice":
      return applicationsTable.requestedPrice
    case "estimatedDeadline":
      return applicationsTable.estimatedDeadline
    case "status":
      return applicationsTable.status
    case "createdAt":
      return applicationsTable.createdAt
    default:
      return applicationsTable.createdAt
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