# Database Migrations

## Creating the Ideas Tables

### For Local Development

Run these commands from the `frontend` directory:

```bash
# Create all tables at once (recommended)
wrangler d1 execute <your-d1-database-name> --local --file=./migrations/create-ideas-tables.sql

# If tables already exist, add new columns:
wrangler d1 execute <your-d1-database-name> --local --file=./migrations/add-slug-and-tweet-fields.sql
```

### For Remote/Production

Remove the `--local` flag:

```bash
wrangler d1 execute <your-d1-database-name> --file=./migrations/create-ideas-tables.sql

# If tables already exist, add new columns:
wrangler d1 execute <your-d1-database-name> --file=./migrations/add-slug-and-tweet-fields.sql
```

### Verify Tables Were Created

```bash
wrangler d1 execute <your-d1-database-name> --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'idea%';"
```

## New Fields Added

The ideas table now includes:
- `slug` - URL-friendly identifier for each idea (unique)
- `tweet_url` - Link to the original tweet (optional)
- `tweet_content` - Content of the original tweet (optional)
