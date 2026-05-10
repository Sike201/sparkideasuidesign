#!/usr/bin/env python3
"""
Import colosseum_builders.csv into the builders table.

Usage:
    python3 scripts/import-colosseum-builders.py

Generates:
    migrations/import-colosseum-builders.sql (single file, for local)
    migrations/import-colosseum-builders-NNN.sql (batches, for remote)

Apply:
    npx wrangler d1 execute <your-d1-database-name> --local --file=migrations/import-colosseum-builders.sql
"""

import csv
import json
import uuid
import os
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "..", "colosseum_builders.csv")
OUT_DIR = os.path.join(SCRIPT_DIR, "..", "migrations")
OUT_PATH = os.path.join(OUT_DIR, "import-colosseum-builders.sql")

BATCH_SIZE = 500
NOW = datetime.now(timezone.utc).isoformat()


def split_list(val: str) -> list:
    if not val or not val.strip():
        return []
    return [s.strip() for s in val.split(",") if s.strip()]


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def main():
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        statements = []
        skipped = 0

        for row in reader:
            username = (row.get("username") or "").strip()
            if not username:
                skipped += 1
                continue

            builder_data = {
                "username": username,
                "display_name": (row.get("display_name") or username).strip(),
                "avatar_url": "",
                "position": (row.get("position") or row.get("current_position_api") or "").strip(),
                "city": (row.get("city_api") or row.get("location") or "").strip(),
                "about": (row.get("about") or "").strip(),
                "skills": split_list(row.get("skills", "")),
                "i_am_a": split_list(row.get("i_am_a") or row.get("roles_api") or ""),
                "looking_for": split_list(row.get("looking_for", "")),
                "interested_in": split_list(row.get("interested_in", "")),
                "languages": split_list(row.get("languages") or row.get("languages_api") or ""),
                "looking_for_teammates_text": (row.get("looking_for_teammates_text") or "").strip(),
                "is_student": (row.get("is_student") or "").strip().lower() == "true",
                "twitter_url": (row.get("twitter") or "").strip(),
                "github_url": (row.get("github") or "").strip(),
                "telegram_url": (row.get("telegram") or "").strip(),
                "wallet_address": "",
                "claimed": False,
                "source": "colosseum",
                "created_at": NOW,
            }

            bid = str(uuid.uuid4())
            json_str = escape_sql(json.dumps(builder_data, ensure_ascii=False))
            statements.append(
                f"INSERT OR IGNORE INTO builders (id, data) VALUES ('{bid}', '{json_str}');"
            )

    imported = len(statements)
    print(f"Parsed {imported} builders, {skipped} skipped (no username)")

    # Verify first entry
    if statements:
        first_json = statements[0].split("', '")[1].rstrip("');").replace("''", "'")
        d = json.loads(first_json)
        print(f"\nFirst builder check:")
        print(f"  username: {d['username']}")
        print(f"  city: {d['city']}")
        print(f"  about: {d['about'][:60]}...")
        print(f"  skills: {d['skills'][:3]}")
        print(f"  i_am_a: {d['i_am_a'][:3]}")
        print(f"  twitter: {d['twitter_url']}")

    cleanup = "DELETE FROM builders WHERE json_extract(data, '$.source') = 'colosseum';"

    # Single file for local
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(f"-- Auto-generated: import colosseum builders\n")
        f.write(f"-- {imported} builders, generated at {NOW}\n\n")
        f.write(f"-- Purge old colosseum imports first\n")
        f.write(f"{cleanup}\n\n")
        f.write("\n".join(statements))
        f.write("\n")

    # Batch files for remote
    total_batches = (imported + BATCH_SIZE - 1) // BATCH_SIZE
    for b in range(total_batches):
        batch = statements[b * BATCH_SIZE : (b + 1) * BATCH_SIZE]
        batch_num = f"{b + 1:03d}"
        batch_path = os.path.join(OUT_DIR, f"import-colosseum-builders-{batch_num}.sql")
        with open(batch_path, "w", encoding="utf-8") as f:
            f.write(f"-- Colosseum builders batch {b + 1}/{total_batches}\n")
            f.write(f"-- {len(batch)} builders\n\n")
            if b == 0:
                f.write(f"-- Purge old colosseum imports first\n")
                f.write(f"{cleanup}\n\n")
            f.write("\n".join(batch))
            f.write("\n")

    print(f"\nDone! {imported} builders, {total_batches} batch files")
    print(f"\nApply locally:")
    print(f"  npx wrangler d1 execute <your-d1-database-name> --local --file=migrations/import-colosseum-builders.sql")
    print(f"\nApply remote (batches):")
    print(f'  for f in migrations/import-colosseum-builders-*.sql; do npx wrangler d1 execute <your-d1-database-name> --file="$f"; done')


if __name__ == "__main__":
    main()
