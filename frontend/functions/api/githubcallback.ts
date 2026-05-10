/**
 * GitHub OAuth callback — redirects to /oauth-callback preserving query params.
 * This path (/api/githubcallback) should be registered in the GitHub app settings.
 */
export const onRequestGet: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const target = new URL("/oauth-callback", url.origin);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  return Response.redirect(target.toString(), 302);
};
