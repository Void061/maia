// Emergency exit: turns off two-step verification when the code cannot be received.
//   npm run account:2fa-off -- someone@example.com
import "dotenv/config";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: npm run account:2fa-off -- <email>");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  "UPDATE accounts SET two_factor = false, updated_at = now() WHERE email = $1 RETURNING email, name",
  [email],
);
await client.end();

if (rows.length === 0) {
  console.error(`Nessun account con email ${email}.`);
  process.exit(1);
}
console.log(`${rows[0].name} <${rows[0].email}>: verifica in due passaggi disattivata`);
