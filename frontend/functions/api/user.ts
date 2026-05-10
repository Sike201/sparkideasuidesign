import { CreateUsernameRequestSchema } from "../../shared/models";
import { parseUserRow, buildUserData, UserRow } from "../../shared/models/userModel";
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database
  VITE_ENVIRONMENT_TYPE: string
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  if (method === 'POST') {
    return handlePostRequest(context);
  }
  if (method === 'GET') {
    return handleGetRequest(context);
  }
  if (method === 'PUT') {
    return handlePutRequest(context);
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      ...corsHeaders(request),
      'Allow': 'OPTIONS, GET, POST, PUT'
    }
  });
};

// Handle GET requests
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const { searchParams } = new URL(ctx.request.url)
    const address = searchParams.get("address")

    if (!address) {
      return jsonResponse({ message: "Address is required" }, 400)
    }

    const row = await db
      .prepare("SELECT address, data FROM user WHERE address = ?")
      .bind(address)
      .first<UserRow>();

    if (!row) {
      return jsonResponse({ message: "User not found" }, 404)
    }

    return jsonResponse(parseUserRow(row as UserRow & Record<string, unknown>), 200)
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

// Handle PUT requests — save email + TOU acceptance
async function handlePutRequest(context: EventContext<ENV, string, unknown>) {
  const db = context.env.DB;
  const request = context.request;

  try {
    const body = await request.json() as {
      address?: string;
      email?: string;
      touAccepted?: boolean;
    };

    if (!body.address || typeof body.address !== "string") {
      return new Response(JSON.stringify({ message: "address is required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }
    if (!body.email || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return new Response(JSON.stringify({ message: "A valid email address is required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }
    if (body.touAccepted !== true) {
      return new Response(JSON.stringify({ message: "You must accept the Terms of Use" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const nowIso = new Date().toISOString();
    const existingRow = await db
      .prepare("SELECT address, data FROM user WHERE address = ?")
      .bind(body.address)
      .first<UserRow>();

    if (!existingRow) {
      await db
        .prepare("INSERT INTO user (address, data) VALUES (?1, ?2)")
        .bind(body.address, JSON.stringify({ email: body.email, tou_accepted_at: nowIso }))
        .run();
    } else {
      const parsed = JSON.parse(existingRow.data || '{}');
      parsed.email = body.email;
      if (!parsed.tou_accepted_at) {
        parsed.tou_accepted_at = nowIso;
      }
      await db
        .prepare("UPDATE user SET data = ?2 WHERE address = ?1")
        .bind(body.address, JSON.stringify(parsed))
        .run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  }
}

// Handle POST requests
async function handlePostRequest(context: EventContext<ENV, string, unknown>) {
  const db = context.env.DB;
  const request = context.request;

  try {
    const requestJson = await request.json();

    const { error, data } = CreateUsernameRequestSchema.safeParse(requestJson);

    if (error) {
      return new Response(JSON.stringify({ message: "Invalid request data" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    const { publicKey, username } = data;

    const existingRow = await db
      .prepare("SELECT address, data FROM user WHERE address = ?")
      .bind(publicKey)
      .first<UserRow>();

    if (!existingRow) {
      const userData = buildUserData({ username });
      await db
        .prepare("INSERT INTO user (address, data) VALUES (?1, ?2)")
        .bind(publicKey, userData)
        .run();
    } else {
      const parsed = JSON.parse(existingRow.data || '{}');
      parsed.username = username;
      await db
        .prepare("UPDATE user SET data = ?2 WHERE address = ?1")
        .bind(publicKey, JSON.stringify(parsed))
        .run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(request)
      }
    });
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(request)
      }
    });
  }
}
