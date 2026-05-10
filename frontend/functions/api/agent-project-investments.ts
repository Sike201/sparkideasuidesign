// File: functions/api/agent-project-investments.ts
// Investment API for agent projects funding

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
  TREASURY_WALLETS?: string;
  ADMIN_ADDRESSES?: string;
};

// SECURITY: Whitelist of allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://sparkidea.io",
  "https://www.sparkidea.io",
  "https://spark-it.pages.dev",
  "https://stage.spark-it.pages.dev",
  "https://justspark.fun",
];

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";

  // SECURITY: Only allow whitelisted origins
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

// SECURITY: Validate Solana transaction signature format (base58, 88 chars typical)
function isValidTransactionSignature(signature: string): boolean {
  if (!signature || typeof signature !== "string") return false;
  // Solana signatures are base58 encoded, typically 87-88 characters
  if (signature.length < 80 || signature.length > 100) return false;
  // Base58 character set (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(signature);
}

// SECURITY: Validate Solana wallet address format
function isValidWalletAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Solana addresses are base58 encoded, 32-44 characters
  if (address.length < 32 || address.length > 44) return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  switch (method) {
    case "GET":
      return handleGetRequest(context);
    case "POST":
      return handlePostRequest(context);
    case "PUT":
      return handlePutRequest(context);
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...corsHeaders(request),
          Allow: "OPTIONS, GET, POST, PUT",
        },
      });
  }
};

// GET - Fetch investments for a project or by wallet
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const projectId = searchParams.get("projectId");
    const wallet = searchParams.get("wallet");

    let investments;

    if (projectId) {
      // Get all investments for a project
      investments = await db
        .prepare(
          `SELECT * FROM agent_project_investments
           WHERE project_id = ?
           ORDER BY created_at DESC`
        )
        .bind(projectId)
        .all();

      // Get the treasury wallet for this project, assign one if it doesn't exist
      let project = await db
        .prepare("SELECT treasury_wallet FROM agent_projects WHERE id = ?")
        .bind(projectId)
        .first<{ treasury_wallet?: string }>();

      let treasuryWallet = project?.treasury_wallet;

      // If no treasury wallet assigned, assign one now
      if (!treasuryWallet) {
        // Get treasury wallets from environment variable
        const treasuryWalletsEnv = ctx.env.TREASURY_WALLETS || "";
        const treasuryWallets = treasuryWalletsEnv
          .split(",")
          .map((addr: string) => addr.trim())
          .filter((addr: string) => addr.length > 0);

        // Fallback to ADMIN_ADDRESSES if TREASURY_WALLETS not configured
        if (treasuryWallets.length === 0) {
          const adminAddresses = (ctx.env.ADMIN_ADDRESSES || "").split(",").map((a: string) => a.trim()).filter((a: string) => a.length > 0);
          if (adminAddresses.length > 0) {
            treasuryWallet = assignTreasuryWallet(projectId, adminAddresses);
          }
        } else {
          treasuryWallet = assignTreasuryWallet(projectId, treasuryWallets);
        }

        // Update project with assigned treasury wallet
        if (treasuryWallet) {
          await db
            .prepare("UPDATE agent_projects SET treasury_wallet = ? WHERE id = ?")
            .bind(treasuryWallet, projectId)
            .run();

          console.log(`✅ [AGENT INVESTMENT GET] Assigned treasury wallet ${treasuryWallet} to project ${projectId}`);
        }
      }

      return jsonResponse({
        investments: investments.results,
        treasury_wallet: treasuryWallet || null
      }, 200);
    } else if (wallet) {
      // Get all investments by a specific wallet
      investments = await db
        .prepare(
          `SELECT i.*, p.title as project_title, p.slug as project_slug
           FROM agent_project_investments i
           JOIN agent_projects p ON i.project_id = p.id
           WHERE i.investor_wallet = ?
           ORDER BY i.created_at DESC`
        )
        .bind(wallet)
        .all();
    } else {
      return jsonResponse({ message: "projectId or wallet parameter is required" }, 400);
    }

    return jsonResponse({ investments: investments.results }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}

// Helper function to assign a treasury wallet to a project deterministically
function assignTreasuryWallet(projectId: string, treasuryWallets: string[]): string {
  if (!treasuryWallets || treasuryWallets.length === 0) {
    return "";
  }

  // Create a simple hash from the project ID
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    const char = projectId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get index
  const index = Math.abs(hash) % treasuryWallets.length;
  return treasuryWallets[index];
}

// POST - Create a new investment
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      projectId?: string;
      investorWallet?: string;
      amountUsdc?: number;
      transactionSignature?: string;
    };

    const { projectId, investorWallet, amountUsdc, transactionSignature } = body;

    // Validate required fields
    if (!projectId || !investorWallet || !amountUsdc) {
      return new Response(
        JSON.stringify({ message: "projectId, investorWallet, and amountUsdc are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate wallet address format
    if (!isValidWalletAddress(investorWallet)) {
      return new Response(
        JSON.stringify({ message: "Invalid wallet address format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate transaction signature format if provided
    if (transactionSignature && !isValidTransactionSignature(transactionSignature)) {
      return new Response(
        JSON.stringify({ message: "Invalid transaction signature format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate amount is a positive number with reasonable bounds
    if (typeof amountUsdc !== "number" || amountUsdc <= 0) {
      return new Response(
        JSON.stringify({ message: "Amount must be greater than 0" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Check for reasonable amount limits (max 1 billion USDC)
    if (amountUsdc > 1_000_000_000) {
      return new Response(
        JSON.stringify({ message: "Amount exceeds maximum allowed" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate decimal precision (max 6 decimals for USDC)
    const decimalParts = amountUsdc.toString().split(".");
    if (decimalParts[1] && decimalParts[1].length > 6) {
      return new Response(
        JSON.stringify({ message: "Amount exceeds maximum decimal precision (6 decimals)" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Check if project exists and get current raised amount and treasury_wallet
    const project = await db
      .prepare("SELECT id, estimated_price, raised_amount, treasury_wallet FROM agent_projects WHERE id = ?")
      .bind(projectId)
      .first<{ id: string; estimated_price: number; raised_amount: number; treasury_wallet?: string }>();

    if (!project) {
      return new Response(JSON.stringify({ message: "Project not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // Assign treasury wallet if not already assigned
    let treasuryWallet = project.treasury_wallet;
    if (!treasuryWallet) {
      // Get treasury wallets from environment variable
      const treasuryWalletsEnv = ctx.env.TREASURY_WALLETS || "";
      const treasuryWallets = treasuryWalletsEnv
        .split(",")
        .map((addr: string) => addr.trim())
        .filter((addr: string) => addr.length > 0);

      // Fallback to ADMIN_ADDRESSES if TREASURY_WALLETS not configured
      if (treasuryWallets.length === 0) {
        const adminAddresses = (ctx.env.ADMIN_ADDRESSES || "").split(",").map((a: string) => a.trim()).filter((a: string) => a.length > 0);
        if (adminAddresses.length > 0) {
          treasuryWallet = assignTreasuryWallet(projectId, adminAddresses);
        } else {
          return new Response(JSON.stringify({ message: "Treasury wallets not configured" }), {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(request),
            },
          });
        }
      } else {
        treasuryWallet = assignTreasuryWallet(projectId, treasuryWallets);
      }

      // Update project with assigned treasury wallet
      await db
        .prepare("UPDATE agent_projects SET treasury_wallet = ? WHERE id = ?")
        .bind(treasuryWallet, projectId)
        .run();

      console.log(`✅ [AGENT INVESTMENT] Assigned treasury wallet ${treasuryWallet} to project ${projectId}`);
    }

    // Check if investment would exceed the goal
    const currentRaised = project.raised_amount || 0;
    const goal = project.estimated_price || 0;
    const remaining = Math.max(0, goal - currentRaised);

    if (amountUsdc > remaining && goal > 0) {
      return new Response(
        JSON.stringify({
          message: `Investment exceeds remaining amount. Maximum: $${remaining}`
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    const id = generateUUID();
    const createdAt = new Date().toISOString();

    // Insert investment
    await db
      .prepare(
        `INSERT INTO agent_project_investments (id, project_id, investor_wallet, amount_usdc, status, transaction_signature, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(id, projectId, investorWallet, amountUsdc, 'active', transactionSignature || null, createdAt)
      .run();

    // Update raised amount on project
    const newRaisedAmount = currentRaised + amountUsdc;
    await db
      .prepare("UPDATE agent_projects SET raised_amount = ? WHERE id = ?")
      .bind(newRaisedAmount, projectId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        investment: {
          id,
          project_id: projectId,
          investor_wallet: investorWallet,
          amount_usdc: amountUsdc,
          status: 'active',
          created_at: createdAt,
        },
        treasury_wallet: treasuryWallet,
        message: "Investment recorded successfully",
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

// PUT - Update investment status (claim/refund)
async function handlePutRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      id?: string;
      action?: 'claim' | 'refund';
    };

    const { id, action } = body;

    if (!id || !action) {
      return new Response(
        JSON.stringify({ message: "id and action are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Get current investment
    const investment = await db
      .prepare("SELECT * FROM agent_project_investments WHERE id = ?")
      .bind(id)
      .first<{ id: string; project_id: string; amount_usdc: number; status: string }>();

    if (!investment) {
      return new Response(JSON.stringify({ message: "Investment not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    if (investment.status !== 'active') {
      return new Response(
        JSON.stringify({ message: `Investment is already ${investment.status}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    const newStatus = action === 'claim' ? 'claimed' : 'refunded';

    // Update investment status
    await db
      .prepare("UPDATE agent_project_investments SET status = ? WHERE id = ?")
      .bind(newStatus, id)
      .run();

    // If refunding, reduce the raised amount
    if (action === 'refund') {
      const project = await db
        .prepare("SELECT raised_amount FROM agent_projects WHERE id = ?")
        .bind(investment.project_id)
        .first<{ raised_amount: number }>();

      if (project) {
        const newRaisedAmount = Math.max(0, (project.raised_amount || 0) - investment.amount_usdc);
        await db
          .prepare("UPDATE agent_projects SET raised_amount = ? WHERE id = ?")
          .bind(newRaisedAmount, investment.project_id)
          .run();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: newStatus,
        message: `Investment ${newStatus} successfully`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
}
