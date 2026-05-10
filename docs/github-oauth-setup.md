# GitHub OAuth Setup for Developer Applications

## Overview
The Apply page uses GitHub OAuth to authenticate developers before they can submit applications to DAOs. This ensures we have verified developer credentials and prevents spam applications.

## Environment Variables Required

### Frontend Environment Variables (in .env)
```
VITE_GITHUB_CLIENT_ID=your_github_client_id
VITE_GITHUB_CLIENT_SECRET=your_github_client_secret  # Only for dev, not exposed to client
```

### Backend Environment Variables (Cloudflare Pages)
```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

## GitHub OAuth App Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Create a new OAuth App with:
   - Application name: "Spark-it Developer Applications"
   - Homepage URL: `https://your-domain.com`
   - Authorization callback URL: `https://your-domain.com/apply`
3. Note the Client ID and Client Secret

## How It Works

1. **Authentication Flow**:
   - User visits `/apply` page
   - Clicks "Connect GitHub" button
   - Redirects to GitHub OAuth authorization
   - GitHub redirects back to `/apply` with auth code
   - Frontend exchanges code for access token via backend API
   - User info is fetched and stored in localStorage

2. **Application Submission**:
   - Only authenticated GitHub users can apply
   - One application per developer per DAO (enforced by database)
   - Applications are stored with GitHub username and ID for verification

3. **Security Features**:
   - Token exchange happens via backend to protect client secret
   - State parameter prevents CSRF attacks
   - GitHub user ID used for deduplication

## API Endpoints

- `POST /api/github-oauth-token` - Exchange authorization code for access token
- `GET /api/daos` - Get all DAOs available for applications
- `POST /api/applications` - Submit a new application
- `GET /api/applications?projectId=X` - Get applications for a specific project
- `GET /api/applications?githubId=X` - Get applications for a specific user

## Database Schema

The applications are stored in the `applications` table with the following structure:

```sql
CREATE TABLE applications (
    id TEXT NOT NULL PRIMARY KEY,
    project_id TEXT NOT NULL,
    github_username TEXT NOT NULL,
    github_id TEXT NOT NULL,
    deliverable_name TEXT NOT NULL,
    requested_price INTEGER NOT NULL,
    estimated_deadline TEXT NOT NULL,
    feature_description TEXT NOT NULL,
    solana_wallet_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Testing

1. Ensure environment variables are set
2. Visit `/apply` page
3. Connect GitHub account
4. See available DAOs (only projects with non-empty `dao` field)
5. Submit an application
6. Verify application is stored in database
7. Try submitting another application to same DAO (should be rejected) 