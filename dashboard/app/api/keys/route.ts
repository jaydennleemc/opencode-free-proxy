import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:6446";

async function forward(
  key: string,
  method: string,
  body?: unknown,
): Promise<NextResponse> {
  let upstream: Response;
  try {
    upstream = await fetch(`${PROXY_URL}/v1/keys`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: `proxy unreachable at ${PROXY_URL}` },
      { status: 502 },
    );
  }
  const data = await upstream.json().catch(() => ({}));
  const status = upstream.status === 401 ? 401 : upstream.status;
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const key = req.cookies.get("ocp_key")?.value;
  if (!key) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  return forward(key, "GET");
}

export async function POST(req: NextRequest) {
  const key = req.cookies.get("ocp_key")?.value;
  if (!key) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  return forward(key, "POST", body);
}
