#!/usr/bin/env bash
# Applies the migration + seed to a throwaway local Postgres 16 (with a minimal Supabase
# auth stub) and checks the RLS policies / constraints. Usage: sudo bash supabase/tests/rls_check.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
S=/var/tmp/achargex-pg; PG=/usr/lib/postgresql/16/bin
rm -rf $S; mkdir -p $S; chown postgres $S
su postgres -c "$PG/initdb -D $S/data -A trust -U postgres >/dev/null && $PG/pg_ctl -D $S/data -o '-p 55432 -k $S' -l $S/log start >/dev/null"
trap 'su postgres -c "$PG/pg_ctl -D $S/data stop -m fast >/dev/null"; rm -rf $S' EXIT
sleep 2
P="psql -h $S -p 55432 -U postgres -v ON_ERROR_STOP=1 -q -t -A"
$P -c "create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid \$\$;
grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;"
$P -f "$ROOT/supabase/migrations/0001_init.sql" 2>/dev/null
$P -f "$ROOT/supabase/seed.sql"
$P -c "insert into auth.users (id,email) values ('11111111-1111-1111-1111-111111111111','a@x.ph'),('22222222-2222-2222-2222-222222222222','b@x.ph'),('33333333-3333-3333-3333-333333333333','o@x.ph');
update profiles set role='owner' where id='33333333-3333-3333-3333-333333333333';
insert into charging_sessions (user_id,station_id,connector_id,charger_identity,state,limit_php,price_per_kwh) values ('11111111-1111-1111-1111-111111111111','stn-matina','con-mtn-b131-1','SIM-MTN-B131','charging',500,33.5);"
pass=0; fail=0
as() { echo "set role $1; select set_config('request.jwt.claim.sub','$2',false);"; }
expect() { # name, expected substring, sql
  out=$(psql -h $S -p 55432 -U postgres -q -t -A -c "$3" 2>&1 | tr "\n" " " || true)
  if [[ "$out" == *"$2"* ]]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 → got: $out"; fail=$((fail+1)); fi
}
A=11111111-1111-1111-1111-111111111111; B=22222222-2222-2222-2222-222222222222; O=33333333-3333-3333-3333-333333333333
expect "anon sees only approved stations" "9" "$(as anon '') select count(*) from stations;"
expect "anon reads no sessions" "0" "$(as anon '') select count(*) from charging_sessions;"
expect "driver sees own session" "1" "$(as authenticated $A) select count(*) from charging_sessions;"
expect "driver cannot see others' sessions" "0" "$(as authenticated $B) select count(*) from charging_sessions;"
expect "driver cannot insert sessions" "row-level security" "$(as authenticated $A) insert into charging_sessions (user_id,station_id,connector_id,charger_identity,limit_php,price_per_kwh) values ('$A','stn-lanang','con-lng-d101-1','SIM-LNG-D101',200,36);"
expect "driver cannot change role" "permission denied" "$(as authenticated $A) update profiles set role='admin' where id=auth.uid();"
expect "only super admin sets roles" "only a super administrator" "$(as authenticated $A) select set_user_role('$A','super_admin');"
expect "owner cannot self-approve" "row-level security" "$(as authenticated $O) insert into stations (id,owner_id,name,address,city,lat,lng,listing_status) values ('s2','$O','Name','Addr','Davao',7.1,125.6,'approved');"
expect "credentials are service-only" "0" "$(as authenticated $O) select count(*) from charger_credentials;"
expect "payment state machine enforced" "invalid payment transition" "insert into payment_transactions (user_id,provider,state,hold_amount,idempotency_key) values ('$B','demo','created',200,'k2'); update payment_transactions set state='captured' where idempotency_key='k2';"
expect "limit is bounded" "limit_php_check" "insert into charging_sessions (user_id,station_id,connector_id,charger_identity,limit_php,price_per_kwh) values ('$B','stn-bgc','con-bgc-d180-1','SIM-BGC-D180',99999,38);"
expect "one active session per connector" "sessions_one_active_per_connector" "insert into charging_sessions (user_id,station_id,connector_id,charger_identity,state,limit_php,price_per_kwh) values ('$B','stn-matina','con-mtn-b131-1','SIM-MTN-B131','starting',200,33.5);"
expect "SIM- prefix reserved for simulator" "chargers_sim_prefix" "insert into chargers (id,station_id,ocpp_identity,is_simulated) values ('x','stn-matina','SIM-FAKE',false);"
echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
