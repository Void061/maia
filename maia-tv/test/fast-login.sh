#!/bin/bash
# Throwaway account for fast-login.cjs; removed by id at the end.
cd "$TEMP/maia-test"
export MAIA_BE=C:/Users/ivanl/Desktop/maia/maia-be
EMAIL=prova-accesso@maia.invalid
PASS=password-di-prova-1
q() { docker exec -i maia-postgres-1 psql -U maia -d maia -tAq; }
HASH=$(cd "$MAIA_BE" && node --input-type=module -e "import { hashPassword } from './dist/auth/crypto.js'; console.log(await hashPassword('$PASS'))")
cleanup() { echo "delete from accounts where id = 't-fast'; delete from device_pairings where account_id is null and user_agent like '%MaiaTV%';" | q; }
trap cleanup EXIT
echo "delete from accounts where id = 't-fast'; insert into accounts (id, email, name, password_hash, status, email_verified_at, approved_at, updated_at) values ('t-fast', '$EMAIL', 'Prova', '$HASH', 'ACTIVE', now(), now(), now()); insert into profiles (id, account_id, name, hue, updated_at) values ('t-fast-p', 't-fast', 'Prova', 200, now());" | q
node fast-login.cjs "$EMAIL" "$PASS" t-fast "$TEMP/maia-test" 2>&1 | cut -c1-200 | tail -36
