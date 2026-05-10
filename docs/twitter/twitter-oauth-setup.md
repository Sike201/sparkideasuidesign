# Twitter/X OAuth Setup for Ideas Feature

## Problem: 400 Bad Request in Staging/Production

If you're getting a `400 Bad Request` error when trying to connect X (Twitter) in staging or production, it's because the **redirect URI is not registered** in your Twitter Developer Portal.

## Solution: Register Redirect URIs

You need to register **all** redirect URIs in your Twitter Developer Portal:

### Required Redirect URIs

1. **Local Development:**
   - `http://localhost:5173/ideas`
   - `http://localhost:8788/ideas` (if using wrangler pages dev)

2. **Staging:**
   - `https://stage.spark-it.pages.dev/ideas`
   - (or your staging domain)

3. **Production:**
   - `https://spark-it.pages.dev/ideas`
   - (or your production domain)

## Steps to Fix

### 1. Go to Twitter Developer Portal

1. Visit: https://developer.twitter.com/en/portal/dashboard
2. Select your app (or create one if needed)
3. Go to **Settings** → **User authentication settings**

### 2. Configure OAuth 2.0

1. Enable **OAuth 2.0**
2. Set **App permissions** to: `Read` (or higher if needed)
3. In **Type of App**: Select "Web App, Automated App or Bot"
4. In **Callback URI / Redirect URL**: Add **ALL** your redirect URIs:
   ```
   http://localhost:5173/ideas
   http://localhost:8788/ideas
   https://stage.spark-it.pages.dev/ideas
   https://spark-it.pages.dev/ideas
   ```
   - You can add multiple URIs, one per line
   - Make sure there are **no trailing slashes**
   - Make sure the paths match exactly (`/ideas`)

### 3. Save Settings

1. Click **Save** at the bottom
2. Wait a few minutes for changes to propagate

### 4. Verify Environment Variables

Make sure these are set in Cloudflare Pages:

**Staging:**
- `TWITTER_CLIENT_ID` = Your Client ID
- `TWITTER_CLIENT_SECRET` = Your Client Secret

**Production:**
- `TWITTER_CLIENT_ID` = Your Client ID  
- `TWITTER_CLIENT_SECRET` = Your Client Secret

## How It Works

1. User clicks "Connect with X" → Frontend generates PKCE challenge
2. Frontend calls `/api/twitter-oauth-url` with `redirect_uri`
3. Backend generates OAuth URL using `TWITTER_CLIENT_ID` from env
4. User is redirected to X.com for authorization
5. X.com redirects back to `redirect_uri` with authorization code
6. Frontend calls `/api/twitter-oauth-token` to exchange code for tokens
7. User info is stored in database

## Common Issues

### Error: "redirect_uri_mismatch"
- **Cause**: The redirect URI in the request doesn't match any registered URI
- **Fix**: Add the exact redirect URI to Twitter Developer Portal

### Error: "invalid_client"
- **Cause**: `TWITTER_CLIENT_ID` or `TWITTER_CLIENT_SECRET` is wrong
- **Fix**: Check environment variables in Cloudflare Pages

### Error: "Something went wrong" in staging/prod but works locally
- **Cause**: Redirect URI not registered for that environment
- **Fix**: Add staging/production redirect URIs to Twitter Developer Portal

## Testing

After adding redirect URIs:

1. Wait 2-5 minutes for changes to propagate
2. Clear browser cache/cookies
3. Try connecting again
4. Check browser console for any errors

## Security Notes

- Never expose `TWITTER_CLIENT_SECRET` in frontend code
- Always use the backend API (`/api/twitter-oauth-url`) to generate OAuth URLs
- The `redirect_uri` must match exactly (case-sensitive, no trailing slashes)
