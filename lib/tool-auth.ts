import { NextRequest, NextResponse } from "next/server";

/** Vaani HTTP tools call our endpoints with a shared secret header. */
export function toolAuthError(req: NextRequest): NextResponse | null {
  const secret = process.env.TOOL_SECRET;
  const given = req.headers.get("x-tool-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!secret || given !== secret) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return null;
}
