import { NextResponse, type NextRequest } from "next/server";
import { PREVIEW_COOKIE } from "@/lib/site/load";

// Settings → Website → Preview: shows the signed-in staff member their own school's draft
// website on this address. The draft itself is still guarded by row-level security.
export async function GET(req: NextRequest) {
  const off = req.nextUrl.searchParams.has("off");
  const url = req.nextUrl.clone();
  url.pathname = off ? "/settings/website" : "/";
  url.search = "";
  const res = NextResponse.redirect(url);
  if (off) res.cookies.delete(PREVIEW_COOKIE);
  else res.cookies.set(PREVIEW_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 2 });
  return res;
}
