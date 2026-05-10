type ENV = {
  DB: D1Database;
};

// OFAC/sanctions restricted countries (ISO 3166-1 alpha-2)
const OFAC_BLOCKED_COUNTRIES = [
  "BY", // Belarus
  "MM", // Myanmar (Burma)
  "VE", // Venezuela
  "AF", // Afghanistan
  "IQ", // Iraq
  "LY", // Libya
  "SO", // Somalia
  "SD", // Sudan
  "YE", // Yemen
  "ZW", // Zimbabwe
  "CD", // Democratic Republic of Congo
  "CU", // Cuba
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
  "RU", // Russia
  "UA", // Ukraine (occupied regions: Crimea, DNR, LNR — CF-IPCountry cannot distinguish sub-regions)
];

const BOT_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
  "pinterest",
  "embedly",
  "googlebot",
  "bingbot",
  "yandex",
  "baiduspider",
  "duckduckbot",
  "applebot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "petalbot",
  "dotbot",
  "rogerbot",
  "opengraph",
  "fetcher",
  "crawler",
  "spider",
  "preview",
  "curl",
];

const BASE_URL = "https://justspark.fun";
const DEFAULT_TITLE = "JustSpark — Submit Ideas, Vote & Build Together";
const DEFAULT_DESCRIPTION =
  "Community-driven platform to submit ideas, vote on the best ones, and help bring them to life on Solana.";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHTML(
  title: string,
  description: string,
  url: string,
  image: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JustSpark" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:alt" content="${escapeHtml(title)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@JustSparkIdeas" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
</body>
</html>`;
}

// Page routes metadata
const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  "/ideas": {
    title: "Community Ideas — Vote & Build Together | JustSpark",
    description:
      "Browse and vote on community ideas. Submit your own idea and let the community decide what gets built next.",
  },
  "/funded": {
    title: "Funded Ideas | JustSpark",
    description:
      "Explore ideas that have been funded by the community and are being built right now.",
  },
  "/teams": {
    title: "Teams | JustSpark",
    description:
      "Discover the teams building ideas funded by the JustSpark community.",
  },
  "/explanation": {
    title: "How It Works | JustSpark",
    description:
      "Learn how JustSpark works: submit ideas, vote, fund, and build together on Solana.",
  },
};

export const onRequest: PagesFunction<ENV> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") || "";
  const path = url.pathname;

  // OFAC compliance: block sanctioned regions
  const country = request.headers.get("CF-IPCountry") || "";
  if (OFAC_BLOCKED_COUNTRIES.includes(country)) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Access Restricted</title></head>
       <body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#000;color:#fff">
         <div style="text-align:center;max-width:500px">
           <h1>Access Restricted</h1>
           <p>This service is not available in your region due to regulatory compliance requirements.</p>
         </div>
       </body></html>`,
      {
        status: 451,
        headers: { "content-type": "text/html; charset=utf-8" },
      }
    );
  }

  // Only intercept bot requests on page routes (skip API, static assets)
  if (!isBot(userAgent) || path.startsWith("/api/") || path.includes(".")) {
    return context.next();
  }

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let image = DEFAULT_IMAGE;
  const canonical = `${BASE_URL}${path}`;

  // Static pages
  const staticPage = STATIC_PAGES[path];
  if (staticPage) {
    title = staticPage.title;
    description = staticPage.description;
  }

  // Dynamic: /ideas/:slug
  const ideaMatch = path.match(/^\/ideas\/([^/]+)$/);
  if (ideaMatch) {
    const slug = ideaMatch[1];
    try {
      const row = await env.DB.prepare(
        `SELECT id, data FROM ideas WHERE json_extract(data, '$.slug') = ?`
      )
        .bind(slug)
        .first<{ id: string; data: string }>();

      if (row) {
        const data = JSON.parse(row.data);
        title = `${data.title} | JustSpark`;
        description =
          (data.description || "").slice(0, 160) || DEFAULT_DESCRIPTION;
        if (data.generated_image_url) {
          image = data.generated_image_url;
        }
      }
    } catch {
      // Fallback to defaults
    }
  }

  // Dynamic: /profile/:username
  const profileMatch = path.match(/^\/profile\/([^/]+)$/);
  if (profileMatch) {
    const username = profileMatch[1];
    title = `@${username} | JustSpark`;
    description = `View @${username}'s ideas, votes, and investments on JustSpark.`;
  }

  return new Response(renderHTML(title, description, canonical, image), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
