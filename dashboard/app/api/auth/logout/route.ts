import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: "ocp_key", path: "/" });
  res.cookies.delete({ name: "ocp_admin", path: "/" });
  return res;
}
