/**
 * Twitter OAuth callback — redirects to /oauth-callback preserving query params.
 * This path (/api/twittercallback) is registered in the Twitter app settings.
 */
export const onRequestGet: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const target = new URL("/oauth-callback", url.origin);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  return Response.redirect(target.toString(), 302);
};
