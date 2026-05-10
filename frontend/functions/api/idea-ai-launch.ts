// File: functions/api/idea-ai-launch.ts
// API endpoint to generate a structured idea + landing page content from an AI conversation

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { buildIdeaData } from "../../shared/models/ideaModel";

type ENV = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        ...corsHeaders(request),
        Allow: "OPTIONS, POST",
      },
    });
  }

  return handlePostRequest(context);
};

// System prompt for OpenAI to extract idea data and generate landing page content
const SYSTEM_PROMPT = `You are a world-class product marketer and copywriter. You will receive a conversation about a product/project idea. Your task is to extract the idea AND create landing page copy that feels like it was written by a human founder, not an AI.

## Instructions

1. Read the full conversation carefully
2. Extract the core idea: title, description, category, budget estimate, coin name, ticker
3. Generate landing page content that feels authentic and founder-written

## Writing Style Rules

- Write like a passionate founder, not a corporate marketer
- Use specific, concrete language — avoid generic buzzwords like "revolutionize", "seamless", "cutting-edge", "game-changing"
- Be direct and punchy. Short sentences. No fluff.
- Use the user's own words and energy from the conversation when possible
- The tone should match the project: a DeFi protocol should sound technical and confident, a gaming project should sound fun and bold, an AI tool should sound sharp and practical
- Features descriptions should explain WHAT it does concretely, not vague promises
- Problem/solution should reference real pain points, not abstract issues

## Categories (pick the most relevant)

- AI x Crypto
- Consumer Apps
- DAO Tooling & Governance
- DeFi
- Gaming
- Identity & Reputation
- Infrastructure
- Payments & Fintech
- Robotic
- RWA
- WEB2

## Output Format

Return ONLY valid JSON (no markdown, no code blocks) in this exact structure:

{
  "idea": {
    "title": "Concise idea name (5 words max)",
    "description": "Detailed description in markdown format. Include sections with **Problem:** (2-3 sentences), **Solution:** (2-3 sentences), **How it works:** (3-4 sentences explaining the mechanism), and **Why now:** (1-2 sentences on timing/opportunity). Aim for 150-300 words total. Write concretely, not generically.",
    "category": "Category from list above",
    "estimated_price": 10000,
    "coin_name": "Suggested coin name for the project token",
    "ticker": "3-5 letter ticker symbol (uppercase)"
  },
  "landing_page": {
    "heroTitle": "Bold headline that captures the core value prop in 6-10 words. No generic 'The Future of X' — be specific.",
    "heroSubtitle": "One punchy sentence that makes someone want to learn more. Reference a real pain point.",
    "problemTitle": "Short problem section title (3-5 words)",
    "problemDescription": "Describe the real problem users face today. Be specific and relatable, not abstract. 2-3 sentences.",
    "solutionTitle": "Short solution section title (3-5 words)",
    "solutionDescription": "How this project fixes the problem. Be concrete about the mechanism. 2-3 sentences.",
    "features": [
      {
        "title": "Feature Name",
        "description": "What this feature DOES in plain language (1 sentence, be specific)",
        "icon": "emoji"
      },
      {
        "title": "Feature Name",
        "description": "What this feature DOES in plain language (1 sentence, be specific)",
        "icon": "emoji"
      },
      {
        "title": "Feature Name",
        "description": "What this feature DOES in plain language (1 sentence, be specific)",
        "icon": "emoji"
      }
    ],
    "ctaTitle": "Direct call to action (3-6 words)",
    "ctaDescription": "One sentence with a concrete reason to get involved now.",
    "colorScheme": "blue"
  }
}

## Color Scheme

Pick based on the project's vibe:
- "blue" - Finance, infrastructure, trust
- "purple" - AI, creative, innovative
- "orange" - Energy, community, social
- "green" - Sustainability, growth, health
- "red" - Gaming, entertainment, bold

## Important

- Title: concise and memorable
- Description: 150-300 words with markdown, structured (Problem, Solution, How it works, Why now)
- Landing page copy: write like a founder pitch, not a marketing template
- Features: 3 concrete features that explain what the product actually does
- Avoid: "revolutionize", "seamless", "cutting-edge", "game-changing", "unlock the power of", "the future of"
- Return ONLY the JSON object, nothing else`;

async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = (await request.json()) as {
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
      userProfile?: {
        username: string;
        avatar: string;
        twitterId?: string;
        walletAddress?: string;
      };
    };

    const { messages, userProfile } = body;

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: "messages array is required and must not be empty" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    if (!userProfile?.username) {
      return new Response(
        JSON.stringify({ message: "userProfile with username is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    if (!ctx.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ message: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Build the conversation context for OpenAI
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // Call OpenAI to extract idea data and generate landing page content
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Here is the conversation about the idea:\n\n${conversationText}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = (await openaiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from OpenAI");
    }

    // Parse JSON response
    let parsed: {
      idea: {
        title: string;
        description: string;
        category: string;
        estimated_price: number;
        coin_name?: string;
        ticker?: string;
      };
      landing_page: {
        heroTitle: string;
        heroSubtitle: string;
        problemTitle: string;
        problemDescription: string;
        solutionTitle: string;
        solutionDescription: string;
        features: Array<{ title: string; description: string; icon: string }>;
        ctaTitle: string;
        ctaDescription: string;
        colorScheme: "blue" | "purple" | "orange" | "green" | "red";
      };
    };

    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        const jsonMatch2 = content.match(/\{[\s\S]*\}/);
        if (jsonMatch2) {
          parsed = JSON.parse(jsonMatch2[0]);
        } else {
          throw new Error("No JSON found in AI response");
        }
      }
    }

    // Validate parsed data
    if (!parsed.idea?.title || !parsed.idea?.description || !parsed.landing_page) {
      throw new Error("AI response missing required fields");
    }

    // Generate ID and slug
    const id = generateUUID();
    const slug = generateSlug(parsed.idea.title);
    const createdAt = new Date().toISOString();

    // Ensure slug is unique
    let finalSlug = slug;
    let slugCounter = 1;
    while (true) {
      const existing = await db
        .prepare("SELECT id FROM ideas WHERE json_extract(data, '$.slug') = ?")
        .bind(finalSlug)
        .first();

      if (!existing) break;
      finalSlug = `${slug}-${slugCounter}`;
      slugCounter++;
    }

    // Build idea data with landing page content embedded
    const ideaData = buildIdeaData({
      title: parsed.idea.title,
      slug: finalSlug,
      description: parsed.idea.description,
      category: parsed.idea.category || "DeFi",
      author_username: userProfile.username,
      author_avatar: userProfile.avatar || "",
      author_twitter_id: userProfile.twitterId || undefined,
      source: "ai_conversation",
      estimated_price: parsed.idea.estimated_price || 10000,
      raised_amount: 0,
      coin_name: parsed.idea.coin_name || undefined,
      ticker: parsed.idea.ticker || undefined,
      ideator_wallet: userProfile.walletAddress || undefined,
      status: "pending",
      created_at: createdAt,
      updated_at: createdAt,
    });

    // Inject landing_page into the JSON data
    const ideaDataObj = JSON.parse(ideaData);
    ideaDataObj.landing_page = parsed.landing_page;
    const finalIdeaData = JSON.stringify(ideaDataObj);

    // Insert idea into database
    await db
      .prepare("INSERT INTO ideas (id, data) VALUES (?, ?)")
      .bind(id, finalIdeaData)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        slug: finalSlug,
        title: parsed.idea.title,
        ideaId: id,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(
      JSON.stringify({ message: "Something went wrong generating your idea..." }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  }
}

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

// Helper function to generate UUID
function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
}
