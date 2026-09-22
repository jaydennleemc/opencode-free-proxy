import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hasKey = req.cookies.has("ocp_key");
  const isLogin = req.nextUrl.pathname.startsWith("/login");

  if (isLogin && hasKey) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!isLogin && !hasKey) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login"] };
