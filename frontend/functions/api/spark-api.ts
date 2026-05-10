// Spark API Directory - Returns all available API endpoints

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction = async (context) => {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  const baseUrl = new URL(request.url).origin;

  const api = {
    name: "Spark API",
    version: "1.0.0",
    description: "Spark Idea Platform - Crowdfunded idea investment platform on Solana",
    base_url: baseUrl,
    guides: {
      how_to_invest_in_an_idea: {
        title: "How to invest in an idea",
        description: "Each idea has an on-chain Solana vault (PDA) where USDC is deposited. Here is the full flow to invest.",
        prerequisites: [
          "A Solana wallet (Phantom, Solflare, Backpack, Jupiter)",
          "USDC tokens on Solana (devnet for testing, mainnet for production)",
        ],
        steps: [
          {
            step: 1,
            action: "Connect your wallet",
            detail: "Use the wallet selector in the UI to connect your Solana wallet via the Wallet Standard adapter.",
          },
          {
            step: 2,
            action: "Choose an idea",
            detail: "Browse ideas at /ideas or fetch them via GET /api/ideas. Each idea with estimatedPrice > 0 has a funding round.",
          },
          {
            step: 3,
            action: "Initialize vault (automatic)",
            detail: "If the idea's vault doesn't exist yet, the first deposit automatically creates it. The vault is a PDA derived from the idea ID using the Spark Idea Vault program.",
          },
          {
            step: 4,
            action: "Deposit USDC on-chain",
            detail: "The frontend builds a deposit transaction using createDepositTransaction(connection, userPublicKey, ideaId, amountInBaseUnits, network). The user signs with their wallet and the transaction is sent to the Solana network.",
          },
          {
            step: 5,
            action: "Record investment in database (verified on-chain)",
            detail: "After on-chain confirmation, a POST to /api/idea-investments records the investment with ideaId, investorWallet, amountUsdc, and transactionSignature. The backend verifies the transaction on-chain (checks signer, amount, and success status) before recording. Duplicate signatures are rejected. Simply calling the API without an actual on-chain transaction will fail.",
          },
          {
            step: 6,
            action: "Cap reached (optional)",
            detail: "When raised_amount >= estimated_price, the API sets cap_reached_at. This disables withdrawals immediately and starts a 48h countdown. After 48h, new investments are also disabled (investment round closed).",
          },
        ],
        withdraw: {
          description: "Users can withdraw their funds at any time before the funding cap is reached.",
          steps: [
            "Build a withdraw transaction using createWithdrawTransaction(connection, userPublicKey, ideaId, amountInBaseUnits, network)",
            "User signs and sends the transaction",
            "After confirmation, PUT /api/idea-investments with action 'refund' updates the investment status",
          ],
          restrictions: [
            "Withdrawals are disabled once the funding cap is reached (raised >= estimatedPrice)",
          ],
        },
        smart_contract: {
          program_id: "8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ (same on devnet and mainnet)",
          program_name: "Spark Idea Vault",
          network: "devnet (mainnet coming soon)",
          rpc_url: "https://api.devnet.solana.com",
          usdc_mint: {
            devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          },
          usdc_decimals: 6,
          pda_derivation: {
            admin_config: {
              seeds: ["admin_config"],
              description: "Singleton admin config PDA",
            },
            vault: {
              seeds: ["vault", "SHA256(ideaId)"],
              description: "Each idea has a unique vault PDA. The seed is: Buffer.from('vault') + SHA256(ideaId). Use PublicKey.findProgramAddressSync([Buffer.from('vault'), sha256(ideaId)], PROGRAM_ID)",
            },
            user_deposit: {
              seeds: ["deposit", "vaultPda", "userPublicKey"],
              description: "Tracks each user's deposit in a vault. Seeds: Buffer.from('deposit') + vaultPda.toBuffer() + userPublicKey.toBuffer()",
            },
            vault_ata: {
              description: "The vault's USDC token account. Derived using getAssociatedTokenAddress(usdcMint, vaultPda, true) - it's a standard ATA owned by the vault PDA",
            },
          },
          instructions: {
            initialize_vault: {
              discriminator_hex: "30bfa32c47813fa4",
              description: "Creates a new vault for an idea. Called automatically on first deposit if vault doesn't exist.",
              data_layout: "discriminator (8 bytes) + idea_id (u32 length + utf8 bytes) + vault_seed (32 bytes = SHA256(ideaId))",
              accounts: [
                "payer (signer, writable)",
                "admin_config (PDA, readonly)",
                "vault (PDA, writable) - the idea vault",
                "usdc_mint (readonly)",
                "vault_ata (writable) - vault's USDC token account",
                "system_program",
                "token_program",
                "associated_token_program",
              ],
            },
            deposit: {
              discriminator_hex: "f223c68952e1f2b6",
              description: "Deposits USDC into a vault for an idea.",
              data_layout: "discriminator (8 bytes) + amount (u64 little-endian, in base units = amount * 10^6)",
              accounts: [
                "user (signer, writable)",
                "admin_config (PDA, readonly)",
                "vault (PDA, writable)",
                "user_token_account (writable) - user's USDC ATA",
                "vault_ata (writable) - vault's USDC ATA",
                "user_deposit (PDA, writable) - tracks user deposit",
                "usdc_mint (readonly)",
                "system_program",
                "token_program",
                "associated_token_program",
              ],
            },
            withdraw: {
              discriminator_hex: "b712469c946da122",
              description: "Withdraws USDC from a vault.",
              data_layout: "discriminator (8 bytes) + amount (u64 little-endian, in base units = amount * 10^6)",
              accounts: [
                "user (signer, writable)",
                "admin_config (PDA, readonly)",
                "vault (PDA, writable)",
                "user_deposit (PDA, writable)",
                "user_token_account (writable) - user's USDC ATA",
                "vault_ata (writable) - vault's USDC ATA",
                "usdc_mint (readonly)",
                "token_program",
              ],
            },
          },
          ai_agent_investment_flow: {
            title: "How an AI agent can invest in an idea programmatically",
            description: "Complete step-by-step flow for an AI agent to build and send a deposit transaction without using the frontend SDK.",
            steps: [
              {
                step: 1,
                action: "Get idea details",
                detail: "GET /api/ideas?id={ideaId} to get the idea, including estimatedPrice and raisedAmount.",
              },
              {
                step: 2,
                action: "Derive the vault PDA",
                code: "const vaultSeed = SHA256(ideaId); // 32 bytes\nconst [vaultPda, bump] = PublicKey.findProgramAddressSync([Buffer.from('vault'), vaultSeed], new PublicKey('8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ'));",
              },
              {
                step: 3,
                action: "Check if vault exists",
                detail: "Call connection.getAccountInfo(vaultPda). If null, the vault needs to be initialized first (see initialize_vault instruction).",
              },
              {
                step: 4,
                action: "Derive other accounts",
                code: "const usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // devnet\nconst vaultAta = getAssociatedTokenAddress(usdcMint, vaultPda, true);\nconst userTokenAccount = getAssociatedTokenAddress(usdcMint, userPublicKey);\nconst [userDepositPda] = PublicKey.findProgramAddressSync([Buffer.from('deposit'), vaultPda.toBuffer(), userPublicKey.toBuffer()], PROGRAM_ID);\nconst [adminConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('admin_config')], PROGRAM_ID);",
              },
              {
                step: 5,
                action: "Build the deposit instruction",
                code: "const data = Buffer.alloc(16);\nBuffer.from('f223c68952e1f2b6', 'hex').copy(data, 0); // deposit discriminator\ndata.writeBigUInt64LE(BigInt(amountUsdc * 1_000_000), 8); // amount in base units\n\nconst instruction = new TransactionInstruction({\n  keys: [\n    { pubkey: userPublicKey, isSigner: true, isWritable: true },\n    { pubkey: adminConfigPda, isSigner: false, isWritable: false },\n    { pubkey: vaultPda, isSigner: false, isWritable: true },\n    { pubkey: userTokenAccount, isSigner: false, isWritable: true },\n    { pubkey: vaultAta, isSigner: false, isWritable: true },\n    { pubkey: userDepositPda, isSigner: false, isWritable: true },\n    { pubkey: usdcMint, isSigner: false, isWritable: false },\n    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },\n    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },\n    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },\n  ],\n  programId: PROGRAM_ID,\n  data,\n});",
              },
              {
                step: 6,
                action: "Sign, send, and confirm the transaction",
                detail: "Build a Transaction, set feePayer and recentBlockhash, sign with the agent's keypair, sendRawTransaction, then confirmTransaction.",
              },
              {
                step: 7,
                action: "Record the investment in the database",
                detail: "POST /api/idea-investments with { ideaId, investorWallet, amountUsdc, transactionSignature }. The backend will verify the transaction on-chain before recording it.",
              },
            ],
            important_notes: [
              "The program ID is: 8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ (same on devnet and mainnet)",
              "Currently on devnet - USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU. On mainnet use EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              "Amounts are in base units (multiply USDC by 10^6). Example: 5 USDC = 5000000",
              "If vault doesn't exist, send initialize_vault first, then deposit in a separate transaction",
              "The API verifies the on-chain transaction before recording - you cannot fake investments",
              "Duplicate transaction signatures are rejected",
              "CRITICAL: When generating a wallet keypair to invest, you MUST save the private key securely. Without the private key, you will permanently lose access to your funds and will not be able to withdraw. Store the private key (base58 or byte array) in a safe location before sending any transaction.",
            ],
          },
        },
      },
      how_to_withdraw: {
        title: "How to withdraw from an idea",
        description: "Users can withdraw their USDC from a vault at any time, unless the funding cap has been reached.",
        steps: [
          {
            step: 1,
            action: "Check eligibility",
            detail: "Withdrawals are only available if the funding cap has NOT been reached (raised < estimatedPrice). Once cap is reached, the Withdraw button is locked.",
          },
          {
            step: 2,
            action: "Open withdraw modal",
            detail: "Click the 'Withdraw' button on the idea's investment section. Enter the amount to withdraw (up to your on-chain deposit).",
          },
          {
            step: 3,
            action: "Sign the on-chain transaction",
            detail: "The frontend builds a withdraw transaction using createWithdrawTransaction(connection, userPublicKey, ideaId, amountInBaseUnits, network). The user signs with their wallet.",
          },
          {
            step: 4,
            action: "Transaction confirmation",
            detail: "The signed transaction is sent to the Solana network. After confirmation, the USDC is returned to the user's wallet.",
          },
          {
            step: 5,
            action: "Update database",
            detail: "For a full withdrawal, PUT /api/idea-investments with action 'refund' is called for each active investment to mark them as refunded.",
          },
        ],
        restrictions: [
          "Cannot withdraw once the funding cap is reached (raised >= estimatedPrice)",
          "Cannot withdraw more than your deposited amount",
          "Minimum withdrawal follows the same rules as the smart contract",
        ],
        cap_reached_behavior: {
          description: "When the funding cap is reached:",
          timeline: [
            "Immediately: Withdraw button is disabled with 'Withdraw Locked' label",
            "A 48h countdown starts from the moment the cap was reached",
            "During 48h: Users can still invest more",
            "After 48h: Investment round closes, 'Invest More' button is also disabled",
          ],
        },
      },
    },
    endpoints: {
      ideas: {
        path: "/api/ideas",
        methods: {
          GET: {
            description: "Fetch ideas with filters and sorting",
            params: {
              id: "string - Fetch single idea by ID",
              slug: "string - Fetch single idea by slug",
              category: "string - Filter by category",
              status: "string - Filter by status (pending, in_progress, completed, planned)",
              authorUsername: "string - Filter by author",
              voterUsername: "string - Filter by voter",
              sortBy: "string - Sort order (votes, newest, oldest, raised, downvotes)",
              limit: "number - Pagination limit (default 50)",
              offset: "number - Pagination offset (default 0)",
            },
          },
          POST: {
            description: "Create a new idea",
            body: {
              title: "string (required)",
              description: "string (required)",
              category: "string (required)",
              authorUsername: "string",
              authorAvatar: "string",
              authorTwitterId: "string",
              source: "string (user | twitter)",
              tweetUrl: "string",
              tweetContent: "string",
              estimatedPrice: "number",
            },
          },
          PUT: {
            description: "Vote on idea or update status",
            body: {
              id: "string (required)",
              action: "string (vote | upvote | downvote)",
              userId: "string (required for voting)",
              voteType: "string (up | down)",
              voterTwitterId: "string",
              voterUsername: "string",
              status: "string (pending | in_progress | completed | planned)",
            },
          },
          DELETE: {
            description: "Delete an idea (admin only)",
            params: { id: "string (required)" },
          },
        },
      },
      idea_investments: {
        path: "/api/idea-investments",
        important: "Calling this API alone does NOT move funds. You must first execute the on-chain deposit transaction via the Spark Idea Vault smart contract, then call this API with the transaction signature. The backend verifies the transaction on-chain before recording it.",
        methods: {
          GET: {
            description: "Fetch investments for an idea or by wallet",
            params: {
              ideaId: "string - Filter by idea ID",
              investorWallet: "string - Filter by investor wallet",
            },
          },
          POST: {
            description: "Record a new investment. The transaction signature is REQUIRED and verified on-chain before the investment is recorded. Duplicate signatures are rejected.",
            security: [
              "Transaction signature is required (no off-chain-only investments)",
              "Transaction is verified on-chain via Solana RPC (getTransaction)",
              "Signer must match the investorWallet address",
              "USDC transfer amount is verified against amountUsdc (1% tolerance)",
              "Duplicate transaction signatures are rejected (prevents replay)",
            ],
            body: {
              ideaId: "string (required)",
              investorWallet: "string (required) - Solana wallet address",
              amountUsdc: "number (required) - Amount in USDC (max 6 decimals)",
              transactionSignature: "string (required) - On-chain transaction signature, verified before recording",
              isOnChain: "boolean",
              vaultAddress: "string",
            },
          },
          PUT: {
            description: "Update investment status (claim/refund). For refunds, the withdrawal transaction signature is required and verified on-chain.",
            security: [
              "Transaction signature is required for refund action",
              "Transaction is verified on-chain via Solana RPC (getTransaction)",
              "Signer must match the investor wallet on record",
              "USDC amount is verified against the investment amount (1% tolerance)",
            ],
            body: {
              id: "string (required)",
              action: "string (claim | refund)",
              transactionSignature: "string (required for refund) - On-chain withdrawal transaction signature, verified before updating",
            },
          },
        },
      },
      idea_comments: {
        path: "/api/idea-comments",
        methods: {
          GET: {
            description: "Fetch comments for an idea",
            params: { ideaId: "string (required)" },
          },
          POST: {
            description: "Create a comment or reply",
            body: {
              ideaId: "string (required)",
              content: "string (required)",
              authorUsername: "string (required)",
              authorAvatar: "string",
              authorTwitterId: "string",
              parentCommentId: "string - For replies",
            },
          },
          PUT: {
            description: "Vote on a comment",
            body: {
              id: "string (required)",
              action: "string (upvote | downvote)",
              userId: "string (required)",
              voteType: "string (up | down)",
            },
          },
          DELETE: {
            description: "Delete a comment",
            params: { id: "string (required)" },
          },
        },
      },
      idea_voters: {
        path: "/api/idea-voters",
        methods: {
          GET: {
            description: "Fetch voters and investors for an idea",
            params: { ideaId: "string (required)" },
            response: "upvoters, downvoters (top 20), investors with amounts",
          },
        },
      },
      agent_projects: {
        path: "/api/agent-projects",
        methods: {
          GET: {
            description: "Fetch agent projects with filters and sorting",
            params: {
              id: "string - Fetch single project by ID",
              slug: "string - Fetch single project by slug",
              status: "string - Filter by status (Draft | Published)",
              sortBy: "string - Sort order (votes, newest, oldest, raised, colosseum_votes, downvotes)",
              limit: "number - Pagination limit (default 50)",
              offset: "number - Pagination offset (default 0)",
            },
          },
          POST: {
            description: "Create a new agent project",
            body: {
              title: "string (required)",
              description: "string (required)",
              teamName: "string",
              colosseumUrl: "string",
              colosseumProjectId: "string",
            },
          },
          PUT: {
            description: "Vote on project or update status",
            body: {
              id: "string (required)",
              action: "string (vote | upvote | downvote)",
              userId: "string",
              voteType: "string (up | down)",
              status: "string (Draft | Published)",
            },
          },
          DELETE: {
            description: "Delete a project (admin only)",
            params: { id: "string (required)" },
          },
        },
      },
      agent_project_investments: {
        path: "/api/agent-project-investments",
        methods: {
          GET: {
            description: "Fetch investments for a project or by wallet",
            params: {
              projectId: "string - Filter by project ID",
              investorWallet: "string - Filter by investor wallet",
            },
          },
          POST: {
            description: "Record a new investment",
            body: {
              projectId: "string (required)",
              investorWallet: "string (required)",
              amountUsdc: "number (required)",
              transactionSignature: "string",
            },
          },
          PUT: {
            description: "Update investment status (claim/refund)",
            body: {
              id: "string (required)",
              action: "string (claim | refund)",
            },
          },
        },
      },
      agent_project_comments: {
        path: "/api/agent-project-comments",
        methods: {
          GET: {
            description: "Fetch comments for a project",
            params: { projectId: "string (required)" },
          },
          POST: {
            description: "Create a comment or reply",
            body: {
              projectId: "string (required)",
              content: "string (required)",
              authorUsername: "string (required)",
              authorAvatar: "string",
              authorTwitterId: "string",
              parentCommentId: "string - For replies",
            },
          },
          PUT: {
            description: "Vote on a comment",
            body: {
              id: "string (required)",
              action: "string (upvote | downvote)",
              userId: "string (required)",
            },
          },
          DELETE: {
            description: "Delete a comment",
            params: { id: "string (required)" },
          },
        },
      },
      generate_idea_image: {
        path: "/api/generate-idea-image",
        methods: {
          POST: {
            description: "Generate an AI image for an idea (DALL-E). Returns cached URL if already generated.",
            body: {
              ideaId: "string (required)",
              title: "string (required)",
              description: "string",
              category: "string",
              problem: "string",
              solution: "string",
            },
            response: "imageUrl, cached (boolean), inProgress (boolean)",
          },
        },
      },
      analyze_market_opportunity: {
        path: "/api/analyze-market-opportunity",
        methods: {
          POST: {
            description: "AI market analysis for an idea (Gemini/OpenAI). Returns cached analysis if available.",
            body: {
              ideaId: "string (required)",
              title: "string (required)",
              description: "string",
              category: "string",
              problem: "string",
              solution: "string",
              marketSize: "string",
              competitors: "string",
              estimatedPrice: "number",
            },
            response: "analysis (markdown report), cached (boolean)",
          },
        },
      },
      twitter_oauth: {
        endpoints: {
          get_url: {
            path: "/api/twitter-oauth-url",
            method: "POST",
            description: "Generate Twitter OAuth authorization URL (PKCE flow)",
            body: {
              redirect_uri: "string (required)",
              state: "string (required)",
              code_challenge: "string (required)",
              code_challenge_method: "string (S256)",
            },
          },
          exchange_token: {
            path: "/api/twitter-oauth-token",
            method: "POST",
            description: "Exchange authorization code for access token and user info",
            body: {
              code: "string (required)",
              redirect_uri: "string (required)",
              code_verifier: "string (required)",
            },
          },
        },
      },
      twitter_users: {
        path: "/api/twitter-users",
        methods: {
          GET: {
            description: "Fetch Twitter user by username",
            params: { username: "string (required)" },
          },
        },
      },
      link_wallet_to_twitter: {
        path: "/api/link-wallet-to-twitter",
        methods: {
          POST: {
            description: "Link a Solana wallet address to a Twitter account",
            body: {
              twitterId: "string (required if no username)",
              username: "string (required if no twitterId)",
              walletAddress: "string (required)",
            },
          },
        },
      },
      ideas_from_tweet: {
        path: "/api/ideas-from-tweet",
        methods: {
          POST: {
            description: "Create an idea from a tweet using AI extraction",
            body: {
              username: "string (required)",
              tweetUrl: "string (required)",
              tweetContent: "string (required)",
            },
          },
        },
      },
      get_tweet_info: {
        path: "/api/get-tweet-info",
        methods: {
          POST: {
            description: "Fetch tweet info from a tweet URL",
            body: { tweet_link: "string (required)" },
            response: "tweetContent, username, userDisplayName, userAvatar, tweetId, createdAt",
          },
        },
      },
      github_oauth: {
        endpoints: {
          get_url: {
            path: "/api/github-oauth-url",
            method: "POST",
            description: "Generate GitHub OAuth authorization URL",
            body: {
              redirect_uri: "string (required)",
              state: "string (required)",
            },
          },
          exchange_token: {
            path: "/api/github-oauth-token",
            method: "POST",
            description: "Exchange authorization code for GitHub access token",
            body: {
              code: "string (required)",
              redirect_uri: "string (required)",
            },
          },
          status: {
            path: "/api/github-oauth-status",
            method: "GET",
            description: "Check GitHub OAuth configuration status",
          },
        },
      },
      github_score: {
        path: "/api/github-score",
        methods: {
          GET: {
            description: "Fetch GitHub score for an application",
            params: { applicationId: "string (required)" },
          },
          POST: {
            description: "Calculate GitHub score for a user",
            body: {
              githubUsername: "string (required)",
              githubAccessToken: "string (required)",
              applicationId: "string - Optional, to update application record",
            },
          },
        },
      },
      all_projects: {
        path: "/api/all-projects",
        methods: {
          GET: {
            description: "Returns all Spark projects (ideas + agent projects) with key metrics: status, raised amount, investor count, wallets, pools, fees, and metadata",
            response: {
              summary: "Global stats (total projects, raised USDC, investor count, breakdown by status)",
              ideas: "Array of idea projects with full details",
              agent_projects: "Array of agent/hackathon projects with full details",
            },
            fields_per_project: [
              "type (idea | agent_project)",
              "fundraise_status (completed | raising | pending)",
              "raised_amount, investor_count, estimated_price",
              "wallets: { treasury, fee, buyback, ideator }",
              "pools: { omnipair, dammv2_1, dammv2_2 }",
              "fees: { total_collected, ideator_available, ideator_claimed }",
              "token_address, coin_name, ticker",
              "votes, comments, metadata",
            ],
          },
        },
      },
      spark_api_directory: {
        path: "/api/spark-api",
        methods: {
          GET: {
            description: "This endpoint - returns all available Spark API endpoints",
          },
        },
      },
    },
  };

  return new Response(JSON.stringify(api, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
};
