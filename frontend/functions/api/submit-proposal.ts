/**
 * Public endpoint to submit a hackathon proposal.
 * POST /api/submit-proposal
 * Body: { hackathon_id, builder_wallet, title, description_md, approach_md, timeline_md, github_url, demo_url, team_members, milestones }
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  )
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as {
      hackathon_id: string
      builder_wallet: string
      title: string
      description_md: string
      approach_md?: string
      timeline_md?: string
      github_url?: string
      demo_url?: string
      team_members?: string[]
      milestones?: { title: string; amount: string; deadline: string }[]
    }

    if (!body.hackathon_id || !body.title || !body.description_md) {
      return jsonResponse({ error: "hackathon_id, title and description_md are required" }, 400)
    }

    // Check hackathon exists and is open
    const hackathon = await ctx.env.DB
      .prepare("SELECT id, data FROM hackathons WHERE id = ?")
      .bind(body.hackathon_id)
      .first()

    if (!hackathon) {
      return jsonResponse({ error: "Hackathon not found" }, 404)
    }

    // Check hackathon is open based on dates (ignore stored status field)
    const hackathonData = JSON.parse(hackathon.data as string)
    const now = Date.now()
    const startDate = hackathonData.start_date ? new Date(hackathonData.start_date).getTime() : null
    const endDate = hackathonData.end_date ? new Date(hackathonData.end_date).getTime() : null

    if (hackathonData.status === "completed") {
      return jsonResponse({ error: "Hackathon is completed" }, 400)
    }
    if (startDate && now < startDate) {
      return jsonResponse({ error: "Hackathon has not started yet" }, 400)
    }
    if (endDate && now > endDate) {
      return jsonResponse({ error: "Hackathon submission period has ended" }, 400)
    }

    // Find or create builder by wallet
    let builder = await ctx.env.DB
      .prepare("SELECT id FROM builders WHERE json_extract(data, '$.wallet_address') = ?")
      .bind(body.builder_wallet)
      .first()

    let builderId: string
    if (builder) {
      builderId = builder.id as string
    } else {
      // Create a minimal builder entry
      builderId = uuidv4()
      const builderData = JSON.stringify({
        username: body.builder_wallet.slice(0, 8),
        display_name: "",
        avatar_url: "",
        position: "",
        city: "",
        about: "",
        skills: [],
        i_am_a: [],
        looking_for: [],
        interested_in: [],
        languages: [],
        looking_for_teammates_text: "",
        is_student: false,
        twitter_url: "",
        github_url: "",
        telegram_url: "",
        wallet_address: body.builder_wallet,
        claimed: false,
        source: "signup",
        created_at: new Date().toISOString(),
      })
      await ctx.env.DB
        .prepare("INSERT INTO builders (id, data) VALUES (?, ?)")
        .bind(builderId, builderData)
        .run()
    }

    // Insert proposal
    const proposalId = uuidv4()
    const milestonesJson = body.milestones ? JSON.stringify(body.milestones) : null

    await ctx.env.DB
      .prepare(
        "INSERT INTO hackathon_proposals (id, hackathon_id, builder_id, title, description_md, approach_md, timeline_md, github_url, demo_url, team_members, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        proposalId,
        body.hackathon_id,
        builderId,
        body.title,
        body.description_md,
        body.approach_md || null,
        body.timeline_md || null,
        body.github_url || null,
        body.demo_url || null,
        JSON.stringify({
          members: body.team_members || [],
          milestones: body.milestones || [],
        }),
        new Date().toISOString()
      )
      .run()

    return jsonResponse({ success: true, proposalId })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}
