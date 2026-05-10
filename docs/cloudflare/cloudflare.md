
# Cloudflare

## Cloudflare Pages

Cloudflare Pages offers developers free hosting for static websites and web applications, integrating seamlessly with popular Git repositories like GitHub, GitLab, and Bitbucket.

### Preview deployments

Preview deployments allow you to preview new versions of your project without deploying it to production.

Every time you open a new pull request on your GitHub repository, Cloudflare Pages will (by default) create a unique preview URL, which will stay updated as you continue to push new commits to the branch. This is only true when pull requests originate from the repository itself.

- [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Control access to your project's Preview deployments with Cloudflare Access](https://www.cloudflare.com/en-gb/zero-trust/products/access/)

### Staging setup

- [Add a custom domain to a branch](https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/)
- [How to create staging environment on Cloudflare Pages](https://dev.to/phanect/how-to-create-staging-environment-on-cloudflare-pages-7ha)

### Other

- [Announcing Pages support for monorepos, wrangler.toml, database integrations and more!](https://blog.cloudflare.com/pages-workers-integrations-monorepos-nextjs-wrangler)
- [Download existing project configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#projects-without-existing-wranglertoml-file)
- [Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/#:~:text=To%20configure%20which%20paths%20are,paths%20to%20nothing%20(%20%5B%5D%20).)
- [TypeScript Configuration](https://developers.cloudflare.com/pages/functions/typescript/)

### Commands

- `npx wrangler pages --help`
- `npx wrangler pages dev` - start local server
- `npx wrangler pages dev --local-protocol=https` - start local https server
- `npx wrangler pages project list` - list projects
- `npx wrangler pages deployment list` - list deployments

## Cloudflare Workers

[CloudFlare Workers](https://developers.cloudflare.com/workers/) are an example of [Edge Computing](https://en.wikipedia.org/wiki/Edge_computing), similar to:
- [Vercel Functions](https://vercel.com/docs/functions)
- [AWS Lambda@Edge](https://aws.amazon.com/lambda/edge/#Dynamic_Web_Application_at_the_Edge)

Features:
- Edge network
- No region selection

Much like a CDN caching static files to optimize content delivery, Edge Computing enables us to position servers closer to our users, enhancing performance and reducing latency.

### Workers architecture

- [Eliminating cold starts with Cloudflare Workers](https://blog.cloudflare.com/eliminating-cold-starts-with-cloudflare-workers)
- [Cloud Computing without Containers](https://blog.cloudflare.com/cloud-computing-without-containers/)

### Tooling

As Workers do not have full [nodejs compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), we are limited in what we can use. Here are some recommended solutions:
- Routing: [hono](https://developers.cloudflare.com/pages/framework-guides/deploy-a-hono-site/) ([npm](https://www.npmjs.com/package/hono))
- ORM: [drizzle](https://developers.cloudflare.com/d1/reference/community-projects/#drizzle-orm) ([npm](https://www.npmjs.com/package/drizzle-orm))
- Validation: [zod](https://zod.dev/) ([npm](https://www.npmjs.com/package/zod))

All listed libraries have 0 dependencies and are supported on CloudFlare Worker's runtime.

Tutorial: [Serverless API with Cloudflare Workers (Hono, D1 & Drizzle ORM)](https://www.youtube.com/watch?v=PxWleEgi3Hw)

### Configuration

- [Create Cloudflare CLI](https://developers.cloudflare.com/pages/get-started/c3)
- [wrangler.toml](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Compatibility Flags](https://developers.cloudflare.com/workers/configuration/compatibility-dates/#compatibility-flags)
- [Why Worker's environment variables contain live objects](https://blog.cloudflare.com/workers-environment-live-object-bindings)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

### Resources

- [YouTube: Is "edge" computing really faster?](https://www.youtube.com/watch?v=yOP5-3_WFus)
- [D1 Get started](https://developers.cloudflare.com/d1/get-started/)
- [Using Cloudflare workers as your only backend](https://www.youtube.com/watch?v=1tM_d3CH0N0)
- [Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Reddit: Vercel vs Cloudflare Pages/Workers](https://www.reddit.com/r/nextjs/comments/s3ec29/vercel_vs_cloudflare_pages_workers/)

### Issues

Weird issues I've encountered with CloudFlare Workers

#### Problem 1 - ip blocking

While trying to do a blockchain call which worked locally I got the following error:

```
"logs": [
    {
      "message": [
        "Error: failed to get recent blockhash: Error: 403 Forbidden:  {\"jsonrpc\":\"2.0\",\"error\":{\"code\": 403, \"message\":\"Your IP or provider is blocked from this endpoint\"}, \"id\": \"5063da60-6aeb-4222-8d37-6305ee787355\" } \r\n"
      ],
      "level": "error",
      "timestamp": 1729004238979
    }
  ]
```

## Other Cloudflare services

- [Cloudflare Image Optimization](https://developers.cloudflare.com/images/)

