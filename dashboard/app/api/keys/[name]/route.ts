import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:6446";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const key = req.cookies.get("ocp_key")?.value;
  if (!key) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const { name } = await params;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${PROXY_URL}/v1/keys/${encodeURIComponent(name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${key}` } },
    );
  } catch {
    return NextResponse.json(
      { error: `proxy unreachable at ${PROXY_URL}` },
      { status: 502 },
    );
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
