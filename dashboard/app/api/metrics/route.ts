import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:6446";
const PROXY_API_KEY = process.env.PROXY_API_KEY;

const VALID_RANGES = new Set(["1h", "24h", "7d", "30d"]);

export async function GET(req: NextRequest) {
  if (!PROXY_API_KEY) {
    return NextResponse.json(
      { error: "PROXY_API_KEY is not set on the dashboard server" },
      { status: 500 },
    );
  }

  const range = req.nextUrl.searchParams.get("range") || "24h";
  if (!VALID_RANGES.has(range)) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${PROXY_URL}/v1/metrics?range=${range}`, {
      headers: { Authorization: `Bearer ${PROXY_API_KEY}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: `proxy unreachable at ${PROXY_URL}` },
      { status: 502 },
    );
  }

  if (upstream.status === 401) {
    return NextResponse.json(
      { error: "proxy rejected PROXY_API_KEY (401)" },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `proxy returned HTTP ${upstream.status}` },
      { status: 502 },
    );
  }

  const data = await upstream.json();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
