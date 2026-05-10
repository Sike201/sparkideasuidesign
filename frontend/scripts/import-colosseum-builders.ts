/**
 * Import colosseum_builders.csv into the builders table.
 *
 * Usage:
 *   npx tsx scripts/import-colosseum-builders.ts
 *
 * This generates migrations/import-colosseum-builders.sql
 * Then apply with:
 *   npx wrangler d1 execute <your-d1-database-name> --local --file=migrations/import-colosseum-builders.sql
 *   npx wrangler d1 execute <your-d1-database-name> --file=migrations/import-colosseum-builders.sql
 */

import { readFileSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CSV_PATH = resolve(__dirname, "../colosseum_builders.csv")
const OUT_PATH = resolve(__dirname, "../migrations/import-colosseum-builders.sql")

// Simple CSV parser that handles quoted fields with commas inside
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function splitList(val: string): string[] {
  if (!val || !val.trim()) return []
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''")
}

// Split CSV content into logical rows, handling multiline quoted fields
function splitCSVRows(content: string): string[] {
  const rows: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < content.length && content[i + 1] === '"') {
        current += '""'
        i++
      } else {
        inQuotes = !inQuotes
      }
      current += ch
    } else if (ch === "\n" && !inQuotes) {
      rows.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) rows.push(current)
  return rows
}

function main() {
  const raw = readFileSync(CSV_PATH, "utf-8")
  const rows = splitCSVRows(raw)
  const header = rows[0]
  const cols = parseCSVLine(header)

  console.log(`Columns: ${cols.join(", ")}`)
  console.log(`Total logical rows (including header): ${rows.length}`)

  const colIndex: Record<string, number> = {}
  cols.forEach((c, i) => {
    colIndex[c.trim()] = i
  })

  const now = new Date().toISOString()
  const statements: string[] = []
  let imported = 0
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const line = rows[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    if (fields.length < cols.length) {
      skipped++
      continue
    }
    const get = (col: string) => (fields[colIndex[col]] || "").trim()

    const username = get("username")
    if (!username) {
      skipped++
      continue
    }

    const builderData = {
      username,
      display_name: get("display_name") || username,
      avatar_url: "",
      position: get("position") || get("current_position_api") || "",
      city: get("city_api") || get("location") || "",
      about: get("about") || "",
      skills: splitList(get("skills")),
      i_am_a: splitList(get("i_am_a") || get("roles_api")),
      looking_for: splitList(get("looking_for")),
      interested_in: splitList(get("interested_in")),
      languages: splitList(get("languages") || get("languages_api")),
      looking_for_teammates_text: get("looking_for_teammates_text") || "",
      is_student: get("is_student")?.toLowerCase() === "true",
      twitter_url: get("twitter") || "",
      github_url: get("github") || "",
      telegram_url: get("telegram") || "",
      wallet_address: "",
      claimed: false,
      source: "colosseum" as const,
      created_at: now,
    }

    const id = randomUUID()
    const json = escapeSQL(JSON.stringify(builderData))

    statements.push(
      `INSERT OR IGNORE INTO builders (id, data) VALUES ('${id}', '${json}');`
    )
    imported++
  }

  const CLEANUP = "DELETE FROM builders WHERE json_extract(data, '$.source') = 'colosseum';"

  // Split into batch files of BATCH_SIZE statements each (D1 has size limits)
  const BATCH_SIZE = 500
  const totalBatches = Math.ceil(statements.length / BATCH_SIZE)

  for (let b = 0; b < totalBatches; b++) {
    const batch = statements.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
    const batchNum = String(b + 1).padStart(3, "0")
    const batchPath = resolve(__dirname, `../migrations/import-colosseum-builders-${batchNum}.sql`)
    const lines = [
      `-- Colosseum builders batch ${b + 1}/${totalBatches}`,
      `-- ${batch.length} builders`,
      "",
    ]
    // Only the first batch cleans up old data
    if (b === 0) {
      lines.push("-- Purge old colosseum imports first")
      lines.push(CLEANUP)
      lines.push("")
    }
    lines.push(...batch, "")
    writeFileSync(batchPath, lines.join("\n"), "utf-8")
  }

  // Also write a single combined file for local use
  const fullSql = [
    "-- Auto-generated: import colosseum builders",
    `-- ${imported} builders, generated at ${now}`,
    "",
    "-- Purge old colosseum imports first",
    CLEANUP,
    "",
    ...statements,
    "",
  ].join("\n")
  writeFileSync(OUT_PATH, fullSql, "utf-8")

  console.log(`\nDone! ${imported} builders exported, ${skipped} skipped (no username)`)
  console.log(`Split into ${totalBatches} batch files (${BATCH_SIZE} per batch)`)
  console.log(`\nApply locally (single file):`)
  console.log(`  npx wrangler d1 execute <your-d1-database-name> --local --file=migrations/import-colosseum-builders.sql`)
  console.log(`\nApply remote (batches):`)
  console.log(`  for f in migrations/import-colosseum-builders-*.sql; do npx wrangler d1 execute <your-d1-database-name> --file="$f"; done`)
}

main()
