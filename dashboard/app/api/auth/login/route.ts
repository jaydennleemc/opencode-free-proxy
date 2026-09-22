import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:6446";

export async function POST(req: NextRequest) {
  const { key } = await req.json().catch(() => ({ key: null }));
  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  const headers = { Authorization: `Bearer ${key.trim()}` };

  // Validate the key against the proxy
  let valid = false;
  try {
    const check = await fetch(`${PROXY_URL}/v1/metrics?range=1h`, {
      headers,
      cache: "no-store",
    });
    valid = check.ok;
  } catch {
    return NextResponse.json(
      { error: `proxy unreachable at ${PROXY_URL}` },
      { status: 502 },
    );
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid API key" }, { status: 401 });
  }

  // Admin keys can list keys — probe once to gate the management UI
  let admin = false;
  try {
    const probe = await fetch(`${PROXY_URL}/v1/keys`, {
      headers,
      cache: "no-store",
    });
    admin = probe.ok;
  } catch {}

  const res = NextResponse.json({ ok: true, admin });
  res.cookies.set("ocp_key", key.trim(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  // Non-httpOnly: lets the client show/hide the admin section (proxy still
  // enforces admin-only on the endpoints themselves)
  res.cookies.set("ocp_admin", admin ? "1" : "0", {
    sameSite: "lax",
    path: "/",
  });
  return res;
}
