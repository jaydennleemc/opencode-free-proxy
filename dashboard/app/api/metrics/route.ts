import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:6446";

const VALID_RANGES = new Set(["1h", "24h", "7d", "30d"]);

export async function GET(req: NextRequest) {
  const key = req.cookies.get("ocp_key")?.value;
  if (!key) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const range = req.nextUrl.searchParams.get("range") || "24h";
  if (!VALID_RANGES.has(range)) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${PROXY_URL}/v1/metrics?range=${range}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: `proxy unreachable at ${PROXY_URL}` },
      { status: 502 },
    );
  }

  if (upstream.status === 401) {
    return NextResponse.json({ error: "session expired" }, { status: 401 });
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
