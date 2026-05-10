// File: functions/api/idea-ai-chat.ts
// Conversational AI endpoint to help users define their startup/crypto idea

import { jsonResponse } from "./cfPagesFunctionsUtils";

type ENV = {
  OPENAI_API_KEY?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type IdeaData = {
  title: string;
  description: string;
  coinName: string;
  ticker: string;
  category: string;
  estimatedPrice: number;
  why: string;
  marketSize: string;
  competitors: string;
};

type ChatResponse = {
  reply: string;
  ideaReady: boolean;
  ideaData?: IdeaData;
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

const SYSTEM_PROMPT = `You are Spark AI, a chill and knowledgeable startup idea advisor on Spark — a Web3 idea launchpad where people submit startup ideas, attach a token, and raise community funding.

Your goal is to have a natural, relaxed conversation that guides the user through defining their idea. You need to gather enough information to fill out a complete idea submission.

## Required Information

You need to collect ALL of the following before the idea is ready:
1. **What the idea is** — the problem it solves and the proposed solution
2. **A title** — a concise name for the project (5 words max)
3. **Coin name** — the name for their token (e.g. "SparkCoin")
4. **Ticker** — a 3-5 character ticker symbol (e.g. "SPRK")
5. **Estimated budget** — how much they think V1 will cost to build (in USD)

## Optional Information (try to gather organically)

- Why this idea matters / why now
- Target market size
- Key competitors or alternatives

## Conversation Guidelines

- Start by asking what idea they have in mind — keep it short, 1-2 sentences max
- Ask questions ONE AT A TIME — don't overwhelm the user
- Be conversational and encouraging, not like a form
- Keep your messages SHORT — 2-3 sentences per message, no walls of text
- Don't be overly enthusiastic or use too many exclamation marks
- Offer suggestions when the user seems stuck (e.g. suggest ticker symbols, help estimate budget)
- If the user gives a vague idea, help them sharpen it by asking clarifying questions
- Do NOT use bullet point summaries to repeat back what the user said — just ask the next question naturally
- For budget estimation, use these rough guidelines:
  - Simple tool/bot: $1,000 - $5,000
  - Basic web app: $5,000 - $15,000
  - Standard DeFi/Web3 app: $15,000 - $35,000
  - Complex protocol: $35,000 - $60,000
  - Infrastructure/highly technical: $60,000 - $100,000

## Categories

Pick the most relevant category for their idea:
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

## When the idea is ready

Once you have collected all 5 required fields (idea/description, title, coin name, ticker, budget) AND the user has confirmed, do the following:
1. Write a SHORT confirmation message (1-2 sentences like "All set! Your idea is ready to launch. Hit the Launch button below to make it live.")
2. Include a JSON block in your response wrapped in \`\`\`json ... \`\`\` with the following structure:

\`\`\`json
{
  "ideaReady": true,
  "ideaData": {
    "title": "Project Title",
    "description": "A clear 2-3 sentence description of the problem and solution",
    "coinName": "TokenName",
    "ticker": "TICK",
    "category": "Category from list",
    "estimatedPrice": 25000,
    "why": "Why this matters / why now (or empty string if not discussed)",
    "marketSize": "Target market size info (or empty string if not discussed)",
    "competitors": "Known competitors or alternatives (or empty string if not discussed)"
  }
}
\`\`\`

IMPORTANT:
- Only include the JSON block when ALL required fields have been gathered AND the user has confirmed. Do NOT include the JSON block in earlier messages.
- The confirmation message BEFORE the JSON block must be meaningful (not empty). The JSON block will be stripped from the displayed message, so the user needs to see your text.
- Do NOT add extra text after the JSON block.`;

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

async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const request = ctx.request;

  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
    };

    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ message: "messages array is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    const openaiApiKey = ctx.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ message: "AI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Build messages array for OpenAI
    const openaiMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("No content in OpenAI response");
    }

    // Check if the response contains the ideaReady JSON block
    const result: ChatResponse = {
      reply,
      ideaReady: false,
    };

    const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.ideaReady && parsed.ideaData) {
          result.ideaReady = true;
          result.ideaData = {
            title: parsed.ideaData.title || "",
            description: parsed.ideaData.description || "",
            coinName: parsed.ideaData.coinName || "",
            ticker: parsed.ideaData.ticker || "",
            category: parsed.ideaData.category || "DeFi",
            estimatedPrice: parsed.ideaData.estimatedPrice || 0,
            why: parsed.ideaData.why || "",
            marketSize: parsed.ideaData.marketSize || "",
            competitors: parsed.ideaData.competitors || "",
          };

          // Clean the JSON block out of the reply so the user sees only the conversational text
          result.reply = reply.replace(/```json\s*[\s\S]*?\s*```/, "").trim();
        }
      } catch {
        // JSON parsing failed — treat as a normal message
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  } catch (e) {
    console.error("idea-ai-chat error:", e);
    return new Response(
      JSON.stringify({ message: "Something went wrong with the AI chat..." }),
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
