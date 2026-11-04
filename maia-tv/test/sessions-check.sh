#!/bin/bash
# Throwaway sessions and account for sessions-check.cjs; all removed by id at the end.
cd "$TEMP/maia-test"
q() { docker exec -i maia-postgres-1 psql -U maia -d maia -tAq; }
id=$(echo "select id from accounts where role='ADMIN' limit 1" | q)
secret=$(grep '^JWT_SECRET' /c/Users/ivanl/Desktop/maia/maia-be/.env | cut -d= -f2- | tr -d '"')
cleanup() { echo "delete from sessions where id like 't-%'; delete from accounts where id = 't-account';" | q; }
trap cleanup EXIT
cat <<EOF | q
insert into accounts (id, email, name, password_hash, status, updated_at) values ('t-account', 'prova-sessioni@maia.invalid', 'Prova', 'x', 'ACTIVE', now());
insert into sessions (id, account_id, refresh_token_hash, user_agent, expires_at, last_used_at) values
 ('t-a', '$id', 't-a', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36', now() + interval '1 day', now()),
 ('t-b', '$id', 't-b', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1', now() + interval '1 day', now() - interval '2 hours'),
 ('t-c', '$id', 't-c', 'Mozilla/5.0 (Linux; Android 9; AFTSS; wv) Chrome/120 Safari/537.36 MaiaTV/1.0', now() + interval '1 day', now() - interval '1 day'),
 ('t-d', '$id', 't-d', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1', now() + interval '1 day', now() - interval '3 days'),
 ('t-other', 't-account', 't-other', 'curl/8', now() + interval '1 day', now());
insert into sessions (id, account_id, refresh_token_hash, expires_at, revoked_at) values ('t-revoked', '$id', 't-revoked', now() + interval '1 day', now());
insert into sessions (id, account_id, refresh_token_hash, expires_at) values ('t-expired', '$id', 't-expired', now() - interval '1 day');
EOF
MAIA_BE=C:/Users/ivanl/Desktop/maia/maia-be node sessions-check.cjs "$id" t-account "$secret" "$TEMP/maia-test" 2>&1 | tail -24
