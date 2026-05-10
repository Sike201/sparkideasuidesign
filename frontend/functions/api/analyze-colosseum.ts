// File: functions/api/analyze-colosseum.ts
// Deep dive analysis using Colosseum Copilot data + Gemini synthesis

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  COLOSSEUM_COPILOT_PAT?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

const COLOSSEUM_API_BASE = "https://copilot.colosseum.com/api/v1";
const COLOSSEUM_COPILOT_VERSION = "1.2.1";

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders(request), Allow: "OPTIONS, POST" },
    });
  }

  return handlePost(context);
};

interface ColosseumProject {
  slug: string;
  name: string;
  oneLiner?: string;
  description?: string;
  hackathon?: { name: string; slug: string; startDate?: string };
  similarity?: number;
  tracks?: Array<{ name: string; key: string }>;
}

interface ColosseumArchive {
  documentId: string;
  title: string;
  author?: string;
  source: string;
  url?: string;
  publishedAt?: string;
  snippet: string;
  similarity?: number;
}

async function searchProjects(
  pat: string,
  query: string
): Promise<ColosseumProject[]> {
  try {
    const res = await fetch(`${COLOSSEUM_API_BASE}/search/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pat}`,
        "X-Copilot-Version": COLOSSEUM_COPILOT_VERSION,
      },
      body: JSON.stringify({
        query: query.slice(0, 500),
        limit: 10,
        diversify: true,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(`Colosseum projects search failed: ${res.status} — ${errorBody}`);
      return [];
    }

    const data = await res.json() as { results?: ColosseumProject[] };
    return data.results || [];
  } catch (err) {
    console.error("Colosseum projects search error:", err);
    return [];
  }
}

async function searchArchives(
  pat: string,
  query: string
): Promise<ColosseumArchive[]> {
  try {
    const res = await fetch(`${COLOSSEUM_API_BASE}/search/archives`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pat}`,
        "X-Copilot-Version": COLOSSEUM_COPILOT_VERSION,
      },
      body: JSON.stringify({
        query: query.slice(0, 500),
        limit: 6,
        intent: "ideation",
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(`Colosseum archives search failed: ${res.status} — ${errorBody}`);
      return [];
    }

    const data = await res.json() as { results?: ColosseumArchive[] };
    return data.results || [];
  } catch (err) {
    console.error("Colosseum archives search error:", err);
    return [];
  }
}

async function handlePost(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const body = await ctx.request.json() as {
      ideaId?: string;
      title?: string;
      description?: string;
      category?: string;
    };

    const { ideaId, title, description, category } = body;

    if (!ideaId || !title) {
      return jsonResponse({ message: "ideaId and title are required" }, 400);
    }

    // Check cache
    const existing = await db
      .prepare(
        `SELECT json_extract(data, '$.colosseum_analysis') as colosseum_analysis,
                json_extract(data, '$.colosseum_score') as colosseum_score
         FROM ideas WHERE id = ?`
      )
      .bind(ideaId)
      .first<{ colosseum_analysis?: string; colosseum_score?: number }>();

    if (existing?.colosseum_analysis) {
      return jsonResponse({
        success: true,
        analysis: existing.colosseum_analysis,
        score: existing.colosseum_score,
        cached: true,
      });
    }

    const colosseumPat = ctx.env.COLOSSEUM_COPILOT_PAT;
    if (!colosseumPat) {
      return jsonResponse({ message: "COLOSSEUM_COPILOT_PAT not configured" }, 500);
    }

    const aiKey = ctx.env.GEMINI_API_KEY || ctx.env.OPENAI_API_KEY;
    if (!aiKey) {
      return jsonResponse({ message: "AI API key not configured" }, 500);
    }

    // Fetch data from Colosseum Copilot in parallel
    const query = `${title} ${category || ""} ${description?.slice(0, 200) || ""}`;
    const [projects, archives] = await Promise.all([
      searchProjects(colosseumPat, query),
      searchArchives(colosseumPat, query),
    ]);

    // Build context for AI synthesis
    const projectsContext = projects.length > 0
      ? projects
          .map(
            (p, i) => {
              const hackathonInfo = p.hackathon?.name ? `${p.hackathon.name}${p.hackathon.startDate ? ` (${p.hackathon.startDate})` : ""}` : "Colosseum";
              const desc = p.oneLiner || p.description?.slice(0, 200) || "N/A";
              const sim = p.similarity ? ` [similarity: ${(p.similarity * 100).toFixed(0)}%]` : "";
              return `${i + 1}. **${p.name}** — ${hackathonInfo} — ${desc}${sim}`;
            }
          )
          .join("\n")
      : "No similar projects found.";

    const archivesContext = archives.length > 0
      ? archives
          .map(
            (a, i) => {
              const date = a.publishedAt ? ` (${a.publishedAt})` : "";
              const author = a.author ? ` by ${a.author}` : "";
              return `${i + 1}. **${a.title}**${author} — ${a.source}${date} — ${a.snippet?.slice(0, 200) || "N/A"}`;
            }
          )
          .join("\n")
      : "No relevant archives found.";

    const systemPrompt = `You are an expert Solana ecosystem analyst using data from Colosseum (the leading Solana hackathon platform). You have access to data from 5,400+ hackathon projects and 84,000+ curated research documents.

Your task: produce a deep dive analysis of the submitted idea based on the Colosseum ecosystem data provided, and give a final score out of 100.

## Output Format (Markdown)

# Deep Dive — {Idea Title}

## Ecosystem Positioning
[How does this idea fit within the Solana ecosystem? What niche does it fill? Based on the similar projects found, is this space crowded or underserved?]

## Similar Projects from Colosseum Hackathons
[Analyze the similar projects found. What worked? What didn't? How is this idea different or better?]

## Market Intelligence
[Based on the archive research, what are the key trends, opportunities, and risks in this space?]

## Strengths
- [Bullet points]

## Risks & Gaps
- [Bullet points]

## Recommendation
[2-3 sentences: should this be built? What would make it succeed?]

---
## Dashboard score details

Give me a Breakdown by Dimension table with 3 columns: Dimension, Score (/100), and Rationale. Score these dimensions: Novelty, Market Timing, Problem Validity, Business Model, Go-to-Market, Regulatory Risk, Defensibility, Founder Execution.

## Colosseum Score: XX/100

## Guidelines
- Be direct and analytical
- Reference specific Colosseum projects by name when relevant
- If no similar projects exist, that's either a strong signal (untapped) or a red flag (no demand)
- The score should reflect how well this idea would perform in a Colosseum hackathon context
- Score honestly.`;

    const userPrompt = `IDEA: ${title}
CATEGORY: ${category || "General"}
DESCRIPTION: ${description?.slice(0, 500) || "Not specified"}

--- COLOSSEUM DATA ---

## Similar Projects (from 5,400+ hackathon submissions):
${projectsContext}

## Relevant Research & Archives (from 84,000+ documents):
${archivesContext}`;

    let analysis: string | undefined;
    let score: number | undefined;

    if (ctx.env.GEMINI_API_KEY) {
      const geminiModels = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro-latest"];
      for (const model of geminiModels) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${ctx.env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
              }),
            }
          );
          if (res.ok) {
            const data = await res.json() as any;
            analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Fallback to OpenAI
    if (!analysis && ctx.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 3000,
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        analysis = data.choices?.[0]?.message?.content;
      }
    }

    if (!analysis) {
      return jsonResponse({ message: "Failed to generate analysis" }, 500);
    }

    // Extract score from analysis text
    const scoreMatch = analysis.match(/Colosseum Score:\s*(\d+)\s*\/\s*100/i);
    score = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;

    // Store in database
    if (score !== undefined) {
      await db
        .prepare(
          `UPDATE ideas SET data = json_set(data, '$.colosseum_analysis', ?, '$.colosseum_score', ?) WHERE id = ?`
        )
        .bind(analysis, score, ideaId)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE ideas SET data = json_set(data, '$.colosseum_analysis', ?) WHERE id = ?`
        )
        .bind(analysis, ideaId)
        .run();
    }

    return jsonResponse({
      success: true,
      analysis,
      score,
      cached: false,
      projectsFound: projects.length,
      archivesFound: archives.length,
    });
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong analyzing with Colosseum..." }, 500);
  }
}
