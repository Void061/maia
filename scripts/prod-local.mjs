// MAIA on this PC the way production runs it: built once, then maia-be with
// `node dist/main` and maia-fe with `next start` (no dev compiler: fast pages,
// less memory). Ports as in dev: backend 3000, frontend 3001.
//
//   npm run prod:local              build both, then start
//   npm run prod:local -- --no-build   start the last build
//
// Needs the database (and Redis) up: docker compose up -d postgres redis mailpit.
// Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const be = path.join(root, 'maia-be');
const fe = path.join(root, 'maia-fe');
const build = !process.argv.includes('--no-build');
const shell = process.platform === 'win32';

const portBusy = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

for (const port of [3000, 3001]) {
  if (await portBusy(port)) {
    console.error(`La porta ${port} è occupata: chiudi prima i server di sviluppo (npm run start:dev / npm run dev).`);
    process.exit(1);
  }
}

function step(label, cmd, args, cwd) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell });
  if (r.status !== 0) {
    console.error(`✖ ${label} non riuscito`);
    process.exit(r.status ?? 1);
  }
}

step('Database: migrazioni', 'npx', ['--no-install', 'prisma', 'migrate', 'deploy'], be);
if (build) {
  step('Backend: build', 'npm', ['run', 'build'], be);
  step('Frontend: build', 'npm', ['run', 'build'], fe);
}

const children = [];
function start(label, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell, env: { ...process.env, NODE_ENV: 'production' } });
  const prefix = (line) => line && console.log(`[${label}] ${line}`);
  child.stdout.on('data', (d) => String(d).split(/\r?\n/).forEach(prefix));
  child.stderr.on('data', (d) => String(d).split(/\r?\n/).forEach(prefix));
  child.on('exit', (code) => {
    console.log(`[${label}] terminato (${code})`);
    stop(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // On Windows the npm/node tree needs taskkill to really end.
    if (shell) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('be', 'npm', ['run', 'start:prod'], be);
start('fe', 'npm', ['run', 'start'], fe);
console.log('\nMAIA in modalità produzione: http://localhost:3001 (sulla rete di casa http://192.168.1.6:3001). Ctrl+C per fermarla.');
