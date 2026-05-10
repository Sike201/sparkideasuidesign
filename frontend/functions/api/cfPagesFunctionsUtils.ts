// @ts-expect-error TS2307: Cannot find module 'crypto' or its corresponding type declarations.
import { createHash } from "node:crypto"
import { DrizzleD1Database } from "drizzle-orm/d1/driver"
import { sql } from "drizzle-orm"
import * as Sentry from "@sentry/cloudflare"

type ResponseOptions = {
  statusCode?: number
  headers?: Record<string, string | undefined>
}
/**
 * Easier way to return response
 * @param retval
 * @param options
 */
export const jsonResponse = (
  retval?: string | Record<string, unknown> | null,
  options?: number | ResponseOptions,
): Response => {
  if (typeof options === 'number') {
    options = {
      statusCode: options,
    }
  }

  const body = (retval !== null && typeof retval === 'object')
    ? JSON.stringify(retval)
    : retval as string
  const status = options?.statusCode ?? 200
  const headers = removeUndefinedValues({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "OPTIONS, GET, PUT, POST, DELETE, HEAD",
    ...(options?.headers ? options.headers : {}),
  })

  return new Response(body, {
    status, headers
  })
}
/**
 * Reports an error.
 * Use this to signal that something unexpected or something that needs attention happened.
 * ATM it writes the error to a DB table, but ultimately we might switch to something else (mailing, sentry, etc.)
 * @param db
 * @param e
 */
export const reportError = async (db: D1Database | DrizzleD1Database, error: unknown) => {
  const e = error instanceof Error ? error : new Error(String(error))

  console.error(e)

  Sentry.captureException(e)

  const id = uuidv4()
  const message = e.message
  const createdAt = new Date().toISOString()
  const json = JSON.stringify({
    stack: e.stack,
    name: e.name,
    cause: e.cause,
  })

  if (db instanceof DrizzleD1Database) {
    await db.run(sql`INSERT INTO error (id, message, created_at, json) VALUES (${id}, ${message}, ${createdAt}, ${json});`)
  } else {
    await db
      .prepare('INSERT INTO error (id, message, created_at, json) VALUES (?1, ?2, ?3, ?4);')
      .bind(id, message, createdAt, json)
      .run()
  }
}
/**************************************/
/********* PRIVATE FUNCTIONS **********/
/**************************************/
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  )
}

export const extractProjectId = (url: string) => {
  const parsedUrl = new URL(url)
  const pathSegments = parsedUrl.pathname.split("/")

  const projectsIndex = pathSegments.indexOf("projects")
  const id = projectsIndex !== -1 ? pathSegments[projectsIndex + 1] : null

  return id
}
export const extractAnalystId = (url: string) => {
  const parsedUrl = new URL(url)
  const pathSegments = parsedUrl.pathname.split("/")

  const analystsIndex = pathSegments.indexOf("analyst")
  const id = analystsIndex !== -1 ? pathSegments[analystsIndex + 1] : null

  return id
}

/**
 * Pick the first candidate that is a valid absolute http(s) URL.
 *
 * Server-side Solana RPC consumers used to do:
 *   `env.VITE_REDEMPTION_MAINNET_RPC_URL || env.VITE_RPC_URL || "fallback"`
 * which broke the moment we set `VITE_RPC_URL=/api/rpc` for the browser
 * proxy: the Pages Function would receive that same string and pass it to
 * `new Connection("/api/rpc", ...)` → "Endpoint URL must start with http:".
 *
 * This filter skips any candidate that isn't a real http(s) URL so the
 * function's RPC env vars stay independent from the browser-side proxy
 * config. Recommended priority order at the call site:
 *   pickRpcUrl(env.HELIUS_RPC_URL, env.VITE_REDEMPTION_MAINNET_RPC_URL,
 *              env.VITE_RPC_URL, "https://api.mainnet-beta.solana.com")
 */
export const pickRpcUrl = (...candidates: Array<string | undefined | null>): string => {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c
  }
  // Should never hit if a literal fallback was passed last; return the
  // public mainnet endpoint so the caller doesn't have to guard `undefined`.
  return "https://api.mainnet-beta.solana.com"
}

function removeUndefinedValues(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
}


