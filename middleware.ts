import { NextRequest, NextResponse } from "next/server";

/** Basic-auth gate for the dashboard (it shows caller details). Webhook + tool routes use their own secrets. */
export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const [, pwd] = atob(auth.slice(6)).split(":");
    if (pwd === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Aangan dashboard"' },
  });
}

export const config = {
  matcher: ["/((?!api/vaani|api/tools|_next/static|_next/image|favicon.ico).*)"],
};
