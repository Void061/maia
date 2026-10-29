// Same-origin gateway to maia-be: the browser only ever talks to maia-fe, so
// the session cookies are first-party and there is no CORS, also when the app
// is opened from a phone or TV on the home network. API_URL is read at request
// time (server-side env), so the same build works in every environment.

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "host"]);

async function forward(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const base = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${base}/${path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers();
  for (const name of ["content-type", "cookie", "user-agent", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = request.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ code: "API_UNREACHABLE", message: "Il server di MAIA non risponde." }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name) && name !== "set-cookie") out.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
