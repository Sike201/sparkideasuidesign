export enum ROUTES {
  LANDING_PAGE = "/",
  IDEAS = "/ideas",
  IDEA = "/ideas/:slug",
  PUBLIC_PROFILE = "/profile/:username",
  EXPLANATION = "/explanation",
  ROADMAP = "/roadmap",
  FUNDED = "/funded",
  TERMS_OF_USE = "https://justspark.notion.site/SPARK-PROTOCOL-TERMS-OF-USE-32541bf35b7780c697c2f28fa430b615",
  TERMS_AND_CONDITIONS = "/terms-and-conditions",
  // Static legal pages required by the Solana dApp Store submission
  // (publisher portal asks for both URLs on the compliance step). Kept
  // in-domain rather than linking out to Notion so the URLs are stable.
  TERMS = "/terms",
  PRIVACY = "/privacy",
  DOCS = "https://docs.borgpad.com",
  BACK_OFFICE = "/back-office-dashboard-2025",
  HACKATHONS = "/hackathons",
  HACKATHON = "/hackathons/:id",
  HACKATHON_APPLY = "/hackathons/:id/apply",
  BUILDERS = "/builders",
  BUILDER = "/builders/:username",
  MY_PROFILE = "/profile",
  OAUTH_CALLBACK = "/oauth-callback",

  // Mini-app (mobile PWA) — Twitter-only auth, custodial wallets, custom
  // mobile UI for the hackathon decision market. Namespace is intentionally
  // separate from the desktop routes so the two surfaces can't collide.
  MINI = "/mini-app",
  MINI_HACKATHONS = "/mini-app/hackathons",
  MINI_HACKATHON = "/mini-app/hackathons/:id",
  MINI_TRADE = "/mini-app/trade",
  MINI_TRADE_PROPOSAL = "/mini-app/trade/:proposalPda",
  MINI_ME = "/mini-app/me",
  MINI_DEPOSIT = "/mini-app/deposit",
}
