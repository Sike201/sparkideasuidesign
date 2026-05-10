
# D1

D1 is a distributed SQLite-like database developed by CloudFlare.

- [Documentation](https://developers.cloudflare.com/d1/)
- [Bindings Concept](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)
- [Local Development](https://developers.cloudflare.com/d1/build-with-d1/local-development/)
- [JSON Columns](https://developers.cloudflare.com/d1/build-with-d1/query-json)
- [PRAGMA Statements](https://developers.cloudflare.com/d1/reference/sql-statements/)
- [Import/Export Data](https://developers.cloudflare.com/d1/build-with-d1/import-export-data/)

## Local Development

In order to set up a local database, one needs to create a `wrangler.toml` file in project root with at least the following:

```toml
[[d1_databases]]
binding = "DB" # Should match preview_database_id
database_name = "DB_NAME"
database_id = "DB_UUID" # wrangler d1 info YOUR_DATABASE_NAME
preview_database_id = "DB" # Required for Pages local development
```

After creating the .toml file and running `wrangler dev` it should output something like this:

```
Your worker has access to the following bindings:
- D1 Databases:
  - DB: DB_NAME (DB), Preview: (DB)

⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8788
```

### Useful commands

- Query local database: `wrangler d1 execute DB_NAME --local --command "SELECT 1;"`
- List all tables: `wrangler d1 execute DB_NAME --remote --command "SELECT name FROM sqlite_master WHERE type='table';"`
- List all columns: `wrangler d1 execute DB_NAME --remote --command "PRAGMA table_info(TABLE_NAME);"`
- 
- 
- Set cache value: `wrangler d1 execute borgpad-production-database --remote --command "UPDATE cache_store SET expires_at = '2024-12-10T09:19:00.00Z' WHERE cache_key = 'exchange-api/swissborg-usd';"`
- Surplus check: `wrangler d1 execute borgpad-production-database --remote --command "SELECT from_address, COUNT(*) as number_of_deposits, (SUM(amount_deposited) / 1000000000) as borg_deposited FROM deposit WHERE project_id = 'borgy' GROUP BY from_address ORDER BY SUM(amount_deposited)" &> "surplus.json"`
- Errors: `wrangler d1 execute borgpad-production-database --remote --command "SELECT message, COUNT(*) FROM error GROUP BY message ORDER BY COUNT(*);" &> "errors.json"`
- Errors2: `wrangler d1 execute borgpad-production-database --remote --command "SELECT message, COUNT(*) FROM error WHERE message NOT LIKE 'Access denied%' GROUP BY message ORDER BY COUNT(*);" &> "errors2.json"`
