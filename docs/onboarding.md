# Onboarding

The point of this document is to ease the process of onboarding to project.

## General Knowledge

This section describes the general knowledge and skills needed to start developing the project, divided in segments ranging from most primitive (basic) to most complex (higher-level concepts and/or project-specific stuff), excluding the domain/business knowledge.

1. Primitives
    1. **JavaScript** - knowledge of JS primitives, from basic syntax to more complex concepts like the Event Loop
    1. **EcmaScript** - knowledge of modern ES standards (es2020, esnext)
    1. **TypeScript** - JS superscript with types, standard for JS development today
    1. **SQL (relational databases)** - general knowledge of RDBMS + drizzle ORM
    1. **React Web Framework** - with additional toolings for it like Vite, React-Query, React-Hook-Form, Tailwind
    1. **CI** - Continuous Integration/Delivery Concept
    1. **Git** - Version Control
1. Architecture
    1. **CloudFlare Pages (+ Functions)**
    1. **CloudFlare Workers**
    1. **CloudFlare D1 Database** (distributed relational database based on SQLite)
    1. **CloudFlare DNS**
    1. **Wrangler** - CloudFlare CLI tool
1. Web3 Knowledge
    1. **Solana** - network itself, SOL, SPL tokens
    1. **@solana/web3.js** - JS lib for interactions with the Solana chain
1. Integrations
    1. **CoinGecko** - exchange data
    1. **Helius** - RPC connection
1. Walkthrough
    1. The code itself
    1. Database - tables, drizzle orm models, migrations


## Folder Structure

```plaintext
project-root/
│── docs/                   # Project documentation
│── frontend/               # Root frontend folder (usual react-vite setup)
│   ├── functions/          # Backend root folder (per CloudFlare Pages Functions spec)
│   │   ├── api/            # API endpoints (file-based routing)
│   │   ├── services/       # Services - this is where business logic lives
│   │   ├── tsconfig.json   # TypeScript config file for backend
│   ├── public/              # Publicly-served assets for frontend
│   ├── script/              # Useful scripts, not used in code
│   ├── shared/              # Shared code between frontend and backend
│   ├── src/              # Frontend code root folder
│   │── package.json            # Project metadata & dependencies
│   │── tsconfig.json           # TypeScript configuration
│── onchain/               # Root onchain folder, smart-contract code, not used anymore
│── workers/               # Folder for workers which we deploy manually
│── README.md               # Project documentation
```

1. Known Flaws 
    1. Backend code isn't typechecked on CI - there's a command to do this `npm run backend-typecheck` but it isn't currently executed in the CI, and is only run manually/locally by the developer. Adding this to the pipeline would prevent any bad code (deemed invalid by TypeScript) to be deployed and would possibly directly prevent errors.
    1. NFT Collections
        1. we still mint and configure nft collections manually for each project before the launch
        1. phantom doesn't group nft's correctly by collection -- possibly because we do not verify the collections or nfts in it ([link](https://developers.metaplex.com/token-metadata/collections))
