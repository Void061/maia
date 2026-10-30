import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ENTRY = new Set(["/", "/login"]);

// Without the refresh-token cookie there is no way to be signed in: protected
// pages redirect to the login before rendering anything. With it, "/" and the
// login go straight to the profiles. A cookie that exists but has expired is
// handled client-side: the failed refresh clears it and useMe sends the user
// to the login, so this can't loop.
export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has("maia_rt");
  const { pathname } = request.nextUrl;

  if (PUBLIC_ENTRY.has(pathname)) {
    return signedIn ? NextResponse.redirect(new URL("/profili", request.url)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/login", "/profili/:path*", "/benvenuto", "/account/:path*", "/admin/:path*", "/tv/:path*", "/guarda/:path*"],
};
