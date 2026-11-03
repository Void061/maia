// Public HTTPS URL for the running dev server (npm run dev on :3001) through
// ngrok. No Basic auth: it got in the way of the video requests, and MAIA
// already asks for its own login.
//
// Usage: npm run remote   (Ctrl+C to close the tunnel)
// Env: NGROK_AUTHTOKEN (otherwise read from the ngrok config file).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import ngrok from "@ngrok/ngrok";

const TARGET_PORT = 3001;

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

const listener = await ngrok.forward({ addr: `localhost:${TARGET_PORT}`, authtoken: authtoken() });

console.log(`MAIA remote: ${listener.url()}`);
console.log(`Inoltra a:   http://localhost:${TARGET_PORT} (Ctrl+C per chiudere)`);

// The tunnel alone does not keep Node running.
const keepAlive = setInterval(() => {}, 1 << 30);

const close = async () => {
  clearInterval(keepAlive);
  await ngrok.disconnect().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
