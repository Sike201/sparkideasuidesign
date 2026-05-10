// @ts-expect-error TS2307: Cannot find module 'crypto' or its corresponding type declarations.
import { createHash } from "node:crypto"
import { eq, sql } from 'drizzle-orm'
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * DrizzleORM schema for the apiKey table.
 * Not exported, but encapsulated in this file, only exporting necessary functionalities.
 */
const apiKeyTable = sqliteTable('api_key', {
  id: text().notNull().primaryKey(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  hash: text().notNull(),
  // json array of permissions
  permissions: text({ mode: 'json' }).notNull().$type<string[]>(),
})


type IsApiKeyValidArgs = {
  db: DrizzleD1Database
  apiKey: string
  permissions: string[]
} | {
  ctx: EventContext<{ DB: D1Database }, any, Record<string, unknown>>
  permissions: string[]
}
/**
 * Returns true if api key is valid and has all required permissions.
 */
export async function isApiKeyValid(args: IsApiKeyValidArgs): Promise<boolean> {
  const db = 'ctx' in args ? drizzle(args.ctx.env.DB) : args.db
  const apiKey = 'ctx' in args ? (args.ctx.request.headers.get('authorization') ?? '') : args.apiKey
  const requiredPermissions = args.permissions

  if (!apiKey) {
    console.log('API Key not provided')
    return false
  }

  const [keyId] = splitByLastUnderscore(apiKey)
  const apiKeyEntity = await db
    .select()
    .from(apiKeyTable)
    .where(eq(apiKeyTable.id, keyId))
    .get()

  if (!apiKeyEntity) {
    console.log('API Key does not exist')
    return false
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  if (apiKeyEntity.hash !== keyHash) {
    console.log('API Key invalid, hash mismatch')
    return false
  }

  const hasAllRequiredPermissions = requiredPermissions.every(rp => apiKeyEntity.permissions.includes(rp))
  if (!hasAllRequiredPermissions) {
    console.log('API Key permissions missing')
    return false
  }

  // happy ending
  return true
}

function splitByLastUnderscore(apiKey: string): [string, string] {
  const lastUnderscoreIndex = apiKey.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) return [apiKey, ''];
  
  return [
    apiKey.slice(0, lastUnderscoreIndex), // Everything before the last underscore
    apiKey.slice(lastUnderscoreIndex + 1) // Everything after the last underscore
  ];
}
