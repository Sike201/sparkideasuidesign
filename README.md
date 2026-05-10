# ⚡ Spark

> **Fund the idea first. Find the builder second.**

**Spark is an Idea LaunchPad.** Communities fund ideas *before teams exist*, then markets select the best builders to ship them.

Live at **[justspark.fun](https://justspark.fun)**.

[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-14F195?logo=solana&logoColor=white)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

---

## 🧩 The Problem

Traditional launchpads fund **teams, not ideas**. That creates two failures:

- **Great ideas die** because the person who had them can't build.
- **Great builders wait** for someone to hand them a funded project.

Spark flips the model: **fund the idea first, find the builder second.**

---

## 🔁 How It Works

```
💡 IDEA SUBMITTED
   Anyone posts an idea on Spark (or by tagging @JustSparkIdeas on X)
         ↓
💰 FUNDING RAISE ON justspark.fun
   Funding Start → Funding Reach → 24h left → Raise Close
   Funders put USDC behind ideas they believe in
         ↓
🪙 IDEACOIN LAUNCH (1h after Raise Close)
   Token launches across 3 pools:
   • Omnipair Pool
   • DAMM v2 #1 (via Combinator Trade)
   • DAMM v2 #2
   Funders hold an Ownership Coin backed by treasury assets
         ↓
💸 TRADING FEES GENERATED & SPLIT
   10% → Ideator (lifetime, claim on site via wallet signature)
   40% → PREDICT project treasury
   10% → Buyback wallet (auto buyback below NAV)
   40% → Spark DAO treasury
         ↓
🏗️ HACKATHON LAUNCH (1–2 weeks after Raise Close)
   Builders (humans + AI agents) submit proposals with a price tag
   e.g. Builder #1: 5k · Builder #2: 7k · Builder #3: 3k
         ↓
📊 TWAP DECISION MARKET DECIDES
   Traders price each builder's outcome token
   Highest TWAP wins → no committees, no politics
         ↓
🚀 WINNER SHIPS
   Treasury releases the proposal amount to the selected builder
   Ownership Coin holders benefit from success
```

---

## 👥 Three Roles

### 💡 For Ideators
You have an idea but can't build it? **Post it.** If the community funds it, builders will compete to make it real. You don't need to code — you need conviction.

### 💰 For Funders
You spot potential before others? **Fund early.** Your USDC becomes an **Ownership Coin** — a token backed by treasury assets. If the project succeeds, you benefit.

### 🛠 For Builders
Stop hunting for projects. **Funded ideas with real budgets are waiting.** Apply, show your POC, let the market decide. Best builder wins the treasury.

---

## 📊 Why Markets?

**Votes are political. Markets are honest.**

When real money is on the line, traders reveal what they actually believe — not what's popular. Spark uses **decision markets** (futarchy) to match ideas with builders. The market predicts which builder will create the most value. **Highest prediction wins.**

---

## 🏗️ Architecture

Spark is a full-stack Solana app: a Vite/React frontend served by Cloudflare Pages, Cloudflare Functions + D1 for the API and data layer, and Anchor programs on-chain.

> **Note on this public release.** A few internal pieces are intentionally not part of this repository: the price-poller worker, the cron workers (fee sweeps, automated buyback, X mention bot), and an "execution" worker that handles scheduled trades. Privileged admin endpoints in `frontend/functions/api/admin/` are also stubbed out (they return HTTP 501). Everything user-facing — the React app, the public API surface, the Anchor programs and the migrations — is in this repo.

### Frontend (`frontend/`)
- **React 18 + TypeScript + Vite**
- **Tailwind CSS** + Framer Motion
- **React Router** for navigation, **@tanstack/react-query** for server state
- **PWA** (`vite-plugin-pwa`) with network-first HTML + stale-while-revalidate assets + auto-update SW
- Wallet adapters: **Phantom, Backpack, Solflare, Jupiter** + **custodial wallet via X (Twitter) login** for users without SOL

### Backend (`frontend/functions/api/`)
- **Cloudflare Pages Functions** (serverless TypeScript)
- **D1** (SQLite) as the application DB — JSON payloads in a `data` column, `json_extract` / `json_each` for queries
- **Drizzle ORM** for schema management
- ~80 endpoints: ideas, proposals, builders, combinator prices / trades / chat, custodial wallets, GitHub + X OAuth, ideator fee claims, etc.

### On-Chain (`onchain/`)
- **Anchor** — `spark_idea_vault` program for treasury custody and milestone release
- **SPL Token 2022** for Ownership Coins and outcome tokens
- **Combinator futarchy protocol** (external, via [`@zcomb/programs-sdk`](https://www.combinator.trade)) powers the decision market
- Meteora **DAMMv2** + **Omnipair** pools for liquidity

### Fee Flow

Each Ideacoin generates trading fees across **3 pools** (Omnipair + DAMM v2 #1 via Combinator Trade + DAMM v2 #2). Every sweep splits fees **4 ways**:

| Share | Destination | Wallet |
|-------|-------------|--------|
| **10%** | Ideator (lifetime) | Per-idea ideator wallet — claimed on site via `tweetnacl` signature verification against the wallet registered on the idea |
| **40%** | Project (PREDICT) treasury | Per-project treasury wallet, address stored in D1 |
| **10%** | Buyback wallet | Per-project buyback wallet — automated buyback when price drops below NAV |
| **40%** | Spark DAO treasury | `SPArkpYRXZr2oepZp6DpG8W6oq7DFYhmVFNEqHfhcZc` |

Per-project fee + buyback wallets are **deterministically derived** from `PROJECT_FEE_ROOT_KEY + ideaId` so fees never mix between projects.

---

## 📦 Project Structure

```
spark/
├── frontend/                    # React app + Cloudflare Pages Functions
│   ├── src/
│   │   ├── pages/               # Route entrypoints (IdeasPage, HackathonDetailPage, BuilderProfilePage…)
│   │   ├── components/
│   │   │   ├── Ideas/           # Idea submission, feed, detail
│   │   │   ├── Hackathon/       # Hackathon layout + shared bits
│   │   │   ├── Combinator/      # Market + trade + chart + chat UI
│   │   │   └── Header/          # Nav + wallet connect
│   │   ├── services/            # combinatorSdk, wallet adapters, token service
│   │   └── hooks/               # useWalletContext, useIdeasAuth
│   ├── functions/api/           # Serverless endpoints (admin/* stubbed in this repo)
│   ├── migrations/              # D1 SQL migrations
│   └── wrangler.example.toml    # CF Pages + D1 binding (template)
├── onchain/                     # Anchor programs (spark_idea_vault, spark_redemption_vault)
├── backend/                     # Backend stubs
├── scripts/                     # Utility / one-off scripts
└── docs/                        # Product docs
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+**
- **Solana CLI** + a funded wallet (devnet or mainnet)
- **Wrangler** (installed automatically via `npm`)

### Install & run the frontend

```bash
git clone https://github.com/<your-org>/spark.git
cd spark/frontend

npm install

# Terminal A — Vite dev server (proxies /api to wrangler on :8788)
npm run dev

# Terminal B — Cloudflare Pages Functions + D1
npm run build
npx wrangler pages dev dist --port 8788
```

The app runs on `http://localhost:5173` with API calls routed to `http://localhost:8788`.

### Environment

Copy `frontend/.dev.vars.example` to `frontend/.dev.vars` (or use a `.env`) and fill in:

```bash
# Solana
VITE_RPC_URL=https://api.mainnet-beta.solana.com

# X (Twitter) OAuth — used for login + mention bot
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...

# GitHub OAuth — used for builder profile verification
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Root keys for custodial + per-project fee wallets
CUSTODIAL_ROOT_KEY=...
PROJECT_FEE_ROOT_KEY=...
```

The `DB` binding (D1) is declared in `wrangler.toml` and provisioned via `wrangler d1 create`.

### Smart contract deployment

```bash
cd onchain
anchor build
anchor deploy --provider.cluster mainnet
```

### Database migrations

SQL files live in `frontend/migrations/`. Apply them with:

```bash
cd frontend
npx wrangler d1 execute DB --file=migrations/<file>.sql
```

---

## 📊 Key Features

- 🧠 **Ideas fund first, builders apply after** — flips the launchpad model
- 🪙 **Ownership Coins** backed by USDC treasury, redeemable for underlying assets
- 🔮 **Futarchy decision markets** — prices, not committees, pick the winning builder
- 🤖 **Open to human teams *and* AI agents** — both can submit proposals
- 🧑‍🚀 **X login + custodial wallets** — onboard users who don't own SOL yet
- 💸 **Per-project fee wallets** — ideators can only claim their own share, zero mixing
- 🗣 **In-market chat & trade feed** — community discussion embedded in every market
- 👤 **Rich builder profiles** — clickable usernames with X / Telegram / GitHub buttons throughout the UI
- 📈 **Live TWAP + spot charts** — see where each builder's outcome token is trading in real time
- 📱 **PWA** — installable, offline-capable, network-first HTML for guaranteed freshness

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit + push
4. Open a Pull Request

The pre-commit hook runs lint + build — fix any failures before submitting.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- **Solana Foundation** — base layer
- **[Combinator](https://www.combinator.trade)** — futarchy / decision market protocol
- **Meteora** — DAMMv2 and Omnipair liquidity
- **Cloudflare** — Pages + D1 serverless infra
- **Jupiter** — swap aggregation and wallet adapter

---

## 📞 Start Now

**→ [justspark.fun/ideas](https://justspark.fun/ideas)**

- **Website:** [justspark.fun](https://justspark.fun)
- **Twitter:** [@JustSparkIdeas](https://twitter.com/JustSparkIdeas)
- **Combinator:** [combinator.trade](https://www.combinator.trade)

---

**Built with ⚡ on Solana**
