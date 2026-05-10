/**
 * Utility function to generate a landing page for an existing idea via OpenAI.
 * Called async (ctx.waitUntil) after idea creation in ideas.ts and ideas-from-tweet.ts.
 */

const LANDING_PAGE_PROMPT = `You are a world-class product marketer and copywriter. You will receive structured data about a product/project idea. Your task is to create landing page copy that feels like it was written by a human founder, not an AI.

## Writing Style Rules

- Write like a passionate founder, not a corporate marketer
- Use specific, concrete language — avoid generic buzzwords like "revolutionize", "seamless", "cutting-edge", "game-changing"
- Be direct and punchy. Short sentences. No fluff.
- The tone should match the project: a DeFi protocol should sound technical and confident, a gaming project should sound fun and bold, an AI tool should sound sharp and practical
- Features descriptions should explain WHAT it does concretely, not vague promises
- Problem/solution should reference real pain points, not abstract issues

## Output Format

Return ONLY valid JSON (no markdown, no code blocks) in this exact structure:

{
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

## Color Scheme

Pick based on the project's vibe:
- "blue" - Finance, infrastructure, trust
- "purple" - AI, creative, innovative
- "orange" - Energy, community, social
- "green" - Sustainability, growth, health
- "red" - Gaming, entertainment, bold

## Important

- Landing page copy: write like a founder pitch, not a marketing template
- Features: 3 concrete features that explain what the product actually does
- Avoid: "revolutionize", "seamless", "cutting-edge", "game-changing", "unlock the power of", "the future of"
- Return ONLY the JSON object, nothing else`;

interface LandingPageContent {
  heroTitle: string;
  heroSubtitle: string;
  problemTitle: string;
  problemDescription: string;
  solutionTitle: string;
  solutionDescription: string;
  features: Array<{ title: string; description: string; icon: string }>;
  ctaTitle: string;
  ctaDescription: string;
  colorScheme: string;
}

export async function generateLandingPage(
  db: D1Database,
  ideaId: string,
  openaiKey: string,
): Promise<void> {
  try {
    // Read idea from DB
    const row = await db
      .prepare("SELECT id, data FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ id: string; data: string }>();

    if (!row) {
      console.error(`[LANDING-PAGE] Idea not found: ${ideaId}`);
      return;
    }

    const idea = JSON.parse(row.data);

    // Skip if already has a landing page
    if (idea.landing_page) {
      console.log(`[LANDING-PAGE] Idea ${ideaId} already has a landing page, skipping`);
      return;
    }

    const ideaContext = [
      `Title: ${idea.title}`,
      `Category: ${idea.category || 'Unknown'}`,
      idea.description ? `Description:\n${idea.description}` : null,
      idea.coin_name ? `Token Name: ${idea.coin_name}` : null,
      idea.ticker ? `Ticker: ${idea.ticker}` : null,
      idea.estimated_price ? `Budget: $${idea.estimated_price}` : null,
    ].filter(Boolean).join('\n\n');

    console.log(`[LANDING-PAGE] Generating for idea "${idea.title}" (${ideaId})`);

    // Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: LANDING_PAGE_PROMPT },
          { role: "user", content: `Here is the idea:\n\n${ideaContext}` },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LANDING-PAGE] OpenAI API error (${response.status}):`, errorText);
      return;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[LANDING-PAGE] No content from OpenAI');
      return;
    }

    // Parse and validate
    let landingPage: LandingPageContent;
    try {
      landingPage = JSON.parse(content);
    } catch {
      console.error('[LANDING-PAGE] Failed to parse OpenAI response:', content.slice(0, 200));
      return;
    }

    if (!landingPage.heroTitle || !landingPage.features) {
      console.error('[LANDING-PAGE] Missing required fields in response');
      return;
    }

    // Patch into idea data
    await db
      .prepare("UPDATE ideas SET data = json_set(data, '$.landing_page', json(?)) WHERE id = ?")
      .bind(JSON.stringify(landingPage), ideaId)
      .run();

    console.log(`[LANDING-PAGE] Generated and saved for "${idea.title}" (${ideaId})`);
  } catch (error) {
    console.error(`[LANDING-PAGE] Error for idea ${ideaId}:`, error);
  }
}
