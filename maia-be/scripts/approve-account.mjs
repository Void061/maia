// Approves an account from the terminal until the admin panel exists.
//   npm run account:approve -- someone@example.com          -> ACTIVE
//   npm run account:approve -- someone@example.com --admin  -> ACTIVE + ADMIN
import "dotenv/config";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const admin = process.argv.includes("--admin");
if (!email) {
  console.error("Uso: npm run account:approve -- <email> [--admin]");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `UPDATE accounts
      SET status = 'ACTIVE', approved_at = now(), updated_at = now()
          ${admin ? ", role = 'ADMIN'" : ""}
    WHERE email = $1
    RETURNING email, name, status, role, email_verified_at`,
  [email],
);
await client.end();

if (rows.length === 0) {
  console.error(`Nessun account con email ${email}.`);
  process.exit(1);
}
const a = rows[0];
console.log(`${a.name} <${a.email}>: ${a.status}, ruolo ${a.role}${a.email_verified_at ? "" : " (email non ancora confermata)"}`);
