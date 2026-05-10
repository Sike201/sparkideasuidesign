// File: functions/api/ideas-from-tweet.ts
// API endpoint to create an idea from a tweet using AI

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { generateLandingPage } from './generate-landing-page';

type ENV = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  VITE_ENVIRONMENT_TYPE: string;
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

// Generate idea content using AI
async function generateIdeaWithAI(
  tweetContent: string,
  tweetUrl: string,
  username: string,
  openaiApiKey?: string
): Promise<{
  title: string;
  problem: string;
  solution: string;
  category: string;
  estimatedPrice?: number;
  error?: string;
  reason?: string;
  suggestion?: string;
}> {
  // If no OpenAI API key, use a fallback simple extraction
  if (!openaiApiKey) {
    console.warn("No OPENAI_API_KEY found, using fallback extraction");
    return generateIdeaFallback(tweetContent, username);
  }

  try {
    const systemPrompt = `You are an idea extraction assistant for a Web3 idea launchpad. Your task is to analyze a tweet and extract a structured idea submission from it.

## Instructions

1. Read the tweet carefully
2. Determine if it contains a viable idea (problem + implied or explicit solution)
3. If viable: extract and structure the idea
4. If not viable: return an error message

## Viability Criteria

A tweet is VIABLE if it contains:
- A clear problem OR pain point
- At least an implied solution direction (even if vague)

A tweet is NOT VIABLE if:
- It's just a complaint with no solution direction
- It's a question without a thesis
- It's too vague to extract any actionable concept
- It's not related to tech/crypto/business

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

## Budget Estimation Guidelines

Base your estimate on complexity:
- Simple tool/bot: $1,000 - $5,000
- Basic web app: $5,000 - $15,000
- Standard DeFi/Web3 app: $15,000 - $35,000
- Complex protocol: $35,000 - $60,000
- Infrastructure/highly technical: $60,000 - $100,000

## Output Format

### If VIABLE:

\`\`\`json
{
  "status": "success",
  "idea": {
    "title": "[Concise idea name - 5 words max]",
    "category": "[Category from list]",
    "problem": "[The problem statement - 1-2 sentences]",
    "solution": "[The proposed solution - 1-2 sentences]",
    "budget_min": [number],
    "budget_max": [number]
  }
}
\`\`\`

### If NOT VIABLE:

\`\`\`json
{
  "status": "error",
  "reason": "[Brief explanation why the tweet cannot be converted to an idea]",
  "suggestion": "[What additional information would be needed]"
}
\`\`\`

## Examples

### Viable Tweet:
"why is there still no way to automatically DCA into multiple tokens based on on-chain signals? like if ETH gas drops below 10 gwei, buy X. if BTC dominance crosses 50%, rebalance to Y. someone build this pls"

**Output:**
\`\`\`json
{
  "status": "success",
  "idea": {
    "title": "Signal-Based Auto DCA Tool",
    "category": "DeFi",
    "problem": "There's no automated way to execute DCA strategies based on on-chain signals like gas prices or market dominance metrics.",
    "solution": "A tool that lets users define conditional rules (if X signal, then Y action) to automatically execute token purchases or portfolio rebalancing.",
    "budget_min": 15000,
    "budget_max": 35000
  }
}
\`\`\`

### Non-Viable Tweet:
"crypto is so confusing lol"

**Output:**
\`\`\`json
{
  "status": "error",
  "reason": "The tweet expresses a general sentiment without identifying a specific problem or suggesting any solution direction.",
  "suggestion": "A viable tweet should describe a specific pain point and at least hint at what a solution might look like."
}
\`\`\``;

    const userPrompt = `TWEET: ${tweetContent}
AUTHOR (optional): @${username}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content from OpenAI");
    }

    // Parse JSON response
    let parsed: any;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find any JSON object
        const jsonMatch2 = content.match(/\{[\s\S]*\}/);
        if (jsonMatch2) {
          parsed = JSON.parse(jsonMatch2[0]);
        } else {
          throw new Error("No JSON found in AI response");
        }
      }
    }

    // Handle error status (non-viable tweet)
    if (parsed.status === "error") {
      return {
        title: "",
        problem: "",
        solution: "",
        category: "DeFi",
        error: "not_viable",
        reason: parsed.reason || "Tweet does not contain a viable idea",
        suggestion: parsed.suggestion || "The tweet needs to describe a specific problem and at least hint at a solution direction.",
      };
    }

    // Handle success status (viable tweet)
    if (parsed.status === "success" && parsed.idea) {
      const idea = parsed.idea;
      // Calculate average budget for estimatedPrice (using midpoint of range)
      const estimatedPrice = idea.budget_min && idea.budget_max 
        ? Math.round((idea.budget_min + idea.budget_max) / 2)
        : (idea.budget_min || idea.budget_max || 10000);

      return {
        title: idea.title || "Untitled Idea",
        problem: idea.problem || "Problem to be identified",
        solution: idea.solution || "Solution to be developed",
        category: idea.category || "DeFi",
        estimatedPrice,
      };
    }

    // Fallback if structure is unexpected
    throw new Error("Unexpected response structure from AI");
  } catch (error) {
    console.error("AI generation failed, using fallback:", error);
    return generateIdeaFallback(tweetContent, username);
  }
}

// Fallback function when AI is not available
function generateIdeaFallback(
  tweetContent: string,
  username: string
): {
  title: string;
  problem: string;
  solution: string;
  category: string;
  estimatedPrice: number;
} {
  // Simple extraction: use first sentence as title, rest as description
  const sentences = tweetContent.split(/[.!?]\s+/).filter((s) => s.trim().length > 0);
  const title = sentences[0]?.substring(0, 60) || "New Idea from Tweet";
  const description = sentences.slice(1).join(". ") || tweetContent;

  return {
    title: title.length > 60 ? title.substring(0, 57) + "..." : title,
    problem: `Problem identified from tweet by @${username}`,
    solution: description || "Solution to be developed based on the tweet content",
    category: "DeFi", // Default category
    estimatedPrice: 10000, // Default estimate
  };
}

// POST - Create idea from tweet using AI
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      username?: string;
      tweetUrl?: string;
      tweetContent?: string;
    };

    const { username, tweetUrl, tweetContent } = body;

    // Validate required fields
    if (!username || !tweetUrl || !tweetContent) {
      return new Response(
        JSON.stringify({ message: "username, tweetUrl, and tweetContent are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    console.log(`🤖 Generating idea from tweet by @${username}...`);

    // Generate idea content using AI
    const aiGenerated = await generateIdeaWithAI(
      tweetContent,
      tweetUrl,
      username,
      ctx.env.OPENAI_API_KEY
    );

    // Check if tweet is not viable
    if (aiGenerated.error === "not_viable") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "not_viable",
          reason: aiGenerated.reason || "Tweet does not contain a viable idea",
          suggestion: aiGenerated.suggestion || "The tweet needs to describe a specific problem and at least hint at a solution direction.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    console.log("✅ AI generated idea:", aiGenerated);

    // Build full description from AI-generated content
    const description = `**Problem:**\n${aiGenerated.problem}\n\n**Solution:**\n${aiGenerated.solution}`;

    // Get Twitter user info (avatar)
    const authorAvatar = `https://unavatar.io/twitter/${username}`;

    // Generate slug
    const generateSlug = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    };

    const id = generateUUID();
    let slug = generateSlug(aiGenerated.title);
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

    // Insert idea into database
    const ideaData = JSON.stringify({
      title: aiGenerated.title,
      slug: finalSlug,
      description,
      category: aiGenerated.category,
      author_username: username || 'anonymous',
      author_avatar: authorAvatar || '',
      author_twitter_id: null,
      source: 'twitter',
      tweet_url: tweetUrl || null,
      tweet_content: tweetContent || null,
      estimated_price: aiGenerated.estimatedPrice || 0,
      raised_amount: 0,
      status: 'pending',
      created_at: createdAt,
      updated_at: createdAt,
    });

    await db
      .prepare(`INSERT INTO ideas (id, data) VALUES (?, ?)`)
      .bind(id, ideaData)
      .run();

    // Generate landing page in background (non-blocking)
    if (ctx.env.OPENAI_API_KEY) {
      ctx.waitUntil(generateLandingPage(db, id, ctx.env.OPENAI_API_KEY));
    }

    const ideaUrl = `${new URL(request.url).origin}/ideas/${finalSlug}`;

    return new Response(
      JSON.stringify({
        success: true,
        id,
        slug: finalSlug,
        url: ideaUrl,
        idea: {
          title: aiGenerated.title,
          category: aiGenerated.category,
          estimatedPrice: aiGenerated.estimatedPrice,
        },
        message: "Idea generated and created successfully",
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
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
}
