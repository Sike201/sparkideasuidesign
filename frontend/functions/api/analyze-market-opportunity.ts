// File: functions/api/analyze-market-opportunity.ts
// API to analyze market opportunity for an idea using AI

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  VITE_ENVIRONMENT_TYPE: string;
};

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

// POST - Analyze market opportunity for an idea
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      ideaId?: string;
      title?: string;
      description?: string;
      category?: string;
      problem?: string;
      solution?: string;
      marketSize?: string;
      competitors?: string;
      why?: string;
      estimatedPrice?: number;
      budgetMin?: number;
      budgetMax?: number;
    };

    const { ideaId, title, description, category, problem, solution, marketSize, competitors, why, estimatedPrice, budgetMin, budgetMax } = body;

    if (!ideaId || !title) {
      return jsonResponse({ message: "ideaId and title are required" }, 400);
    }

    // Check if analysis already exists
    const existingIdea = await db
      .prepare("SELECT json_extract(data, '$.market_analysis') as market_analysis FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ market_analysis?: string }>();

    if (existingIdea?.market_analysis) {
      return jsonResponse({
        success: true,
        analysis: existingIdea.market_analysis,
        cached: true,
      }, 200);
    }

    // Use Gemini or OpenAI for analysis
    const apiKey = ctx.env.GEMINI_API_KEY || ctx.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse({ message: "AI API key not configured" }, 500);
    }

    const systemPrompt = `You are an expert Web3 analyst evaluating early-stage ideas for a crypto idea launchpad. Your task is to produce a concise 1-page research report analyzing the viability of a submitted idea.

## Instructions

1. Analyze the idea submission thoroughly
2. Conduct web research to find real competitors, market data, and relevant trends
3. Produce a structured Markdown report (see format below)
4. Be direct and analytical - no fluff

## Scoring System (100 points total)

Distribute points across these categories:
- Problem Clarity & Urgency: /20
- Market Opportunity: /25
- Competitive Positioning: /20
- Technical Feasibility: /20
- Team Fit (if applicable) / Execution Risk: /15

## Output Format

\`\`\`markdown
# {Idea Title} - Research Report

## TL;DR
[2-3 sentences: What is it, is it worth building, why/why not]

## Problem Validation (/20)
[Is the problem real? How urgent/frequent? Who suffers from it? Score justification]

**Score: X/20**

## Market Opportunity (/25)
[TAM/SAM/SOM if applicable, growth trends, timing - why now?]

**Score: X/25**

## Competitive Landscape (/20)
[List specific competitors with links. What's the gap? What would be the differentiator?]

| Competitor | Link | What they do | Gap/Weakness |
|------------|------|--------------|--------------|
| Name | URL | Description | Opportunity |

**Score: X/20**

## Technical Feasibility (/20)
[Complexity assessment, probable tech stack, key technical risks]

**Score: X/20**

## Execution Risk (/15)
[What could go wrong? Dependencies? Regulatory concerns?]

**Score: X/15**

## Pros & Cons

| ✅ Pros | ❌ Cons |
|---------|---------|
| Point 1 | Point 1 |
| Point 2 | Point 2 |
| Point 3 | Point 3 |

## POC Estimate
**Estimated MVP Cost: $X,XXX - $XX,XXX**

[Brief justification: what's included in this estimate]

---

## Final Score: XX/100

**Verdict:** [One sentence recommendation: Strong opportunity / Worth exploring / Needs refinement / Pass]
\`\`\`

## Guidelines

- Be honest and critical - sugar-coating helps no one
- Always find at least 2-3 real competitors (or adjacent solutions)
- If you can't find market data, estimate based on adjacent markets
- POC estimate should reflect a functional demo, not a full product
- Use web search to get current, accurate information`;

    const budgetRange = budgetMin && budgetMax 
      ? `${budgetMin} - ${budgetMax}`
      : estimatedPrice 
        ? `${estimatedPrice}`
        : "Not specified";

    const userPrompt = `IDEA: ${title}
CATEGORY: ${category || "General"}
PROBLEM: ${problem || "Not specified"}
SOLUTION: ${solution || description?.substring(0, 500) || "Not specified"}
WHY (optional): ${why || "Not specified"}
MARKET SIZE (optional): ${marketSize || "Not specified"}
COMPETITORS (optional): ${competitors || "Not specified"}
BUDGET RANGE: ${budgetRange}`;

    let analysis: string;

    if (ctx.env.GEMINI_API_KEY) {
      // Use Gemini - try different model names and versions
      let geminiSuccess = false;
      const geminiModels = [
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-pro',
      ];
      const geminiVersions = ['v1', 'v1beta'];
      
      for (const version of geminiVersions) {
        if (geminiSuccess) break;
        
        for (const modelName of geminiModels) {
          if (geminiSuccess) break;
          
          try {
            const geminiResponse = await fetch(
              `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${ctx.env.GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
                  }],
                  generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 3000,
                  },
                }),
              }
            );

            if (geminiResponse.ok) {
              const geminiData = await geminiResponse.json();
              analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis unavailable";
              geminiSuccess = true;
              break;
            }
          } catch (error) {
            // Continue to next model/version
            continue;
          }
        }
      }
      
      // If Gemini failed, fallback to OpenAI
      if (!geminiSuccess) {
        if (ctx.env.OPENAI_API_KEY) {
          // Silently fallback to OpenAI - no need to log Gemini errors if fallback works
          const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
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
              max_tokens: 3000,
            }),
          });

          if (!openaiResponse.ok) {
            throw new Error(`OpenAI API error: ${openaiResponse.status}`);
          }

          const openaiData = await openaiResponse.json() as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          analysis = openaiData.choices?.[0]?.message?.content || "Analysis unavailable";
        } else {
          throw new Error("Both Gemini and OpenAI API keys failed or are unavailable");
        }
      }
    } else {
      // Use OpenAI
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
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
          max_tokens: 3000,
        }),
      });

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData: {
        choices?: Array<{ message?: { content?: string } }>;
      } = await openaiResponse.json();
      analysis = openaiData.choices?.[0]?.message?.content || "Analysis unavailable";
    }

    // Store analysis in database
    await db
      .prepare("UPDATE ideas SET data = json_set(data, '$.market_analysis', ?) WHERE id = ?")
      .bind(analysis, ideaId)
      .run();

    return jsonResponse({
      success: true,
      analysis,
      cached: false,
    }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong analyzing market opportunity..." }, 500);
  }
}
