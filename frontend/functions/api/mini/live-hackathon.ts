/**
 * GET /api/mini/live-hackathon
 *
 * Returns the id of the "currently live" hackathon — by product rule,
 * exactly one may be live at a time, defined as `status === "voting"`
 * (the window where users trade the decision market before it resolves).
 *
 * Used by the post-login redirect to drop users directly onto the live
 * market page instead of forcing them through the list. If no hackathon
 * is in voting, the client falls back to `/m/hackathons` (the list).
 *
 * No auth: the set of live markets is public info (the hackathons list
 * endpoint is public too). We only expose the id — frontend fetches the
 * full record through the existing `GET /api/hackathons?id=<id>` path.
 *
 * Response:
 *   { id: string | null }
 *
 * Why a dedicated endpoint instead of filtering on the client?
 *   - The redirect runs before any other data is fetched, so we want a
 *     single cheap call with only the field we need.
 *   - Keeps the "what counts as live" rule centralised server-side — if
 *     we later widen it (e.g. also include `status === "open"`), every
 *     client that redirects stays consistent without a frontend ship.
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

type Row = {
  id: string
  // D1's `json_extract` returns the primitive value — a string here.
  created_at: string | null
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    // Hackathon payloads live as JSON blobs in `hackathons.data`, so we
    // pick the live ones with `json_extract`. Sort by `created_at` DESC
    // purely as a tiebreaker — product promised "never more than one
    // live at a time", but if that invariant ever slips we prefer the
    // most recently-created one, which matches the list view's order.
    const row = await ctx.env.DB
      .prepare(
        `SELECT id, json_extract(data, '$.created_at') AS created_at
         FROM hackathons
         WHERE json_extract(data, '$.status') = 'voting'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .first<Row>()

    return jsonResponse({ id: row?.id ?? null })
  } catch (err) {
    console.error("[mini/live-hackathon]", err)
    // Returning `null` on error is safer than a 500: the redirect just
    // falls back to `/m/hackathons` and the user sees something usable
    // instead of a broken page.
    return jsonResponse({ id: null })
  }
}
