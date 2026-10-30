// Public HTTPS URL for the running dev server (npm run dev on :3001) through
// ngrok, always behind Basic auth. ngrok's own basic_auth requires passwords of
// 8+ characters, so the check is done here: a small proxy in front of next dev
// (HTTP + WebSocket for hot reload) that ngrok forwards to.
//
// Usage: npm run remote   (Ctrl+C to close the tunnel)
// Env: NGROK_AUTHTOKEN (otherwise read from the ngrok config file),
//      REMOTE_USER / REMOTE_PASSWORD to override the default credentials.

import http from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import ngrok from "@ngrok/ngrok";

const TARGET_PORT = 3001;
const USER = process.env.REMOTE_USER ?? "Ivan";
const PASSWORD = process.env.REMOTE_PASSWORD ?? "12341@";
const EXPECTED = Buffer.from(`Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`);

function authtoken() {
  if (process.env.NGROK_AUTHTOKEN) return process.env.NGROK_AUTHTOKEN;
  const configs = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ngrok", "ngrok.yml"),
    join(homedir(), "AppData", "Local", "ngrok", "ngrok.yml"),
    join(homedir(), ".config", "ngrok", "ngrok.yml"),
    join(homedir(), "Library", "Application Support", "ngrok", "ngrok.yml"),
    join(homedir(), ".ngrok2", "ngrok.yml"),
  ].filter(Boolean);
  for (const file of configs) {
    try {
      const match = readFileSync(file, "utf8").match(/^\s*authtoken:\s*["']?([^"'\s]+)/m);
      if (match) return match[1];
    } catch {
      // not there, try the next one
    }
  }
  throw new Error("ngrok authtoken not found: set NGROK_AUTHTOKEN or run `ngrok config add-authtoken <token>`.");
}

function authorized(req) {
  const given = Buffer.from(req.headers.authorization ?? "");
  return given.length === EXPECTED.length && timingSafeEqual(given, EXPECTED);
}

const server = http.createServer((req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="MAIA", charset="UTF-8"' }).end("Unauthorized");
    return;
  }
  const headers = { ...req.headers };
  delete headers.authorization;
  const upstream = http.request(
    { host: "localhost", port: TARGET_PORT, method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Il frontend non risponde su localhost:${TARGET_PORT} (npm run dev è acceso?)`);
  });
  req.pipe(upstream);
});

// Hot reload (next dev's WebSocket).
server.on("upgrade", (req, socket, head) => {
  if (!authorized(req)) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  const headers = { ...req.headers };
  delete headers.authorization;
  const upstream = http.request({ host: "localhost", port: TARGET_PORT, method: req.method, path: req.url, headers });
  upstream.on("upgrade", (up, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${up.statusCode} ${up.statusMessage}`];
    for (let i = 0; i < up.rawHeaders.length; i += 2) lines.push(`${up.rawHeaders[i]}: ${up.rawHeaders[i + 1]}`);
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upHead.length) socket.write(upHead);
    if (head.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    upSocket.on("error", () => socket.destroy());
    socket.on("error", () => upSocket.destroy());
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const listener = await ngrok.forward({ addr: `127.0.0.1:${port}`, authtoken: authtoken() });

console.log(`MAIA remote: ${listener.url()}`);
console.log(`Basic auth:  ${USER} / ${PASSWORD}`);
console.log(`Inoltra a:   http://localhost:${TARGET_PORT} (Ctrl+C per chiudere)`);

const close = async () => {
  await ngrok.disconnect().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
