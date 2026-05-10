/**
 * POST /api/trigger-landing-page
 *
 * Public endpoint to trigger landing page generation for an idea.
 * Called lazily when a user visits an idea's landing page and it doesn't exist yet.
 * Returns immediately — generation happens in background via ctx.waitUntil.
 * Idempotent: skips if landing_page already exists.
 */

import { jsonResponse } from './cfPagesFunctionsUtils';
import { generateLandingPage } from './generate-landing-page';

type ENV = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
};

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { ideaId } = (await ctx.request.json()) as { ideaId?: string };

    if (!ideaId) {
      return jsonResponse({ error: 'ideaId is required' }, 400);
    }

    if (!ctx.env.OPENAI_API_KEY) {
      return jsonResponse({ error: 'OpenAI not configured' }, 500);
    }

    // Quick check: does the idea exist and not already have a landing page?
    const row = await ctx.env.DB
      .prepare("SELECT json_extract(data, '$.landing_page') as lp FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ lp: string | null }>();

    if (!row) {
      return jsonResponse({ error: 'Idea not found' }, 404);
    }

    if (row.lp) {
      return jsonResponse({ status: 'already_exists' }, 200);
    }

    // Fire and forget
    ctx.waitUntil(generateLandingPage(ctx.env.DB, ideaId, ctx.env.OPENAI_API_KEY));

    return jsonResponse({ status: 'generating' }, 202);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
};
