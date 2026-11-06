-- =====================================================================
-- AChargeX — initial schema, constraints, indexes and row-level security
-- Mirrors packages/shared/src/types.ts and apps/ocpp/src/supabase-mirror.ts.
--
-- Write model:
--   * Operational writes (sessions, payments, connector status, QR, credentials)
--     are performed by the OCPP service with the SERVICE ROLE key (bypasses RLS).
--   * Browser clients use the anon key + user JWT and are limited by the
--     policies below. Clients can never write payment state, session totals,
--     meter values, charger status, roles or ownership.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.app_role as enum ('guest','driver','owner','operator','admin','super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_status as enum ('draft','pending','approved','rejected','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_state as enum ('created','authorizing','authorized','starting','charging','stopping','completed','failed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_state as enum ('created','pending','authorized','captured','partially_refunded','refunded','voided','failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- profiles & roles
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        public.app_role not null default 'driver',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Role check used by policies. SECURITY DEFINER so it can read profiles under RLS.
create or replace function public.has_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any(roles));
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['operator','admin','super_admin']::public.app_role[]);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['admin','super_admin']::public.app_role[]);
$$;

-- New auth user → driver profile (+ app_metadata.role used by the OCPP service JWT check).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('role','driver') where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- owners
create table if not exists public.owners (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles(id) on delete cascade,
  business_name  text not null check (length(business_name) between 2 and 120),
  tin            text,
  contact_email  text,
  contact_phone  text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- stations / chargers / connectors / tariffs
create table if not exists public.stations (
  id              text primary key,
  owner_id        uuid references public.profiles(id) on delete set null,
  name            text not null check (length(name) between 2 and 80),
  address         text not null check (length(address) between 2 and 160),
  city            text not null,
  lat             double precision not null check (lat between 4 and 22),
  lng             double precision not null check (lng between 116 and 127),
  listing_status  public.listing_status not null default 'draft',
  opening_hours   text not null default 'Open 24 hours',
  is_24h          boolean not null default false,
  access          text not null default 'public' check (access in ('public','customers','private')),
  amenities       text[] not null default '{}',
  deal            jsonb,
  is_demo         boolean not null default false,
  source          text not null default 'owner' check (source in ('demo','simulator','ocpp','owner')),
  photo_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists stations_owner_idx on public.stations(owner_id);
create index if not exists stations_status_idx on public.stations(listing_status);
create index if not exists stations_geo_idx on public.stations(lat, lng);

create table if not exists public.tariffs (
  id                 text primary key,
  station_id         text not null references public.stations(id) on delete cascade,
  price_per_kwh      numeric(8,2) not null check (price_per_kwh > 0 and price_per_kwh <= 200),
  idle_fee_per_min   numeric(8,2) check (idle_fee_per_min >= 0),
  idle_grace_min     integer check (idle_grace_min >= 0),
  label              text
);
create index if not exists tariffs_station_idx on public.tariffs(station_id);

create table if not exists public.chargers (
  id                 text primary key,
  station_id         text not null references public.stations(id) on delete cascade,
  ocpp_identity      text not null unique check (ocpp_identity ~ '^[A-Za-z0-9._:*-]{1,48}$'),
  vendor             text,
  model              text,
  firmware           text,
  ocpp_version       text check (ocpp_version in ('1.6','2.0.1')),
  is_simulated       boolean not null default false,
  commissioned       boolean not null default false,
  connected          boolean not null default false,
  last_heartbeat_at  timestamptz,
  created_at         timestamptz not null default now(),
  -- Simulated chargers must use the SIM- prefix; real ones must not.
  constraint chargers_sim_prefix check ((is_simulated and ocpp_identity like 'SIM-%') or (not is_simulated and ocpp_identity not like 'SIM-%'))
);
create index if not exists chargers_station_idx on public.chargers(station_id);

-- Basic-auth password hashes. RLS enabled with NO policies → service role only.
create table if not exists public.charger_credentials (
  ocpp_identity  text primary key references public.chargers(ocpp_identity) on delete cascade,
  password_hash  text not null,
  rotated_at     timestamptz not null default now()
);

create table if not exists public.connectors (
  id                  text primary key,
  charger_id          text not null references public.chargers(id) on delete cascade,
  station_id          text not null references public.stations(id) on delete cascade,
  ocpp_connector_id   integer not null check (ocpp_connector_id >= 1),
  label               text not null,
  type                text not null check (type in ('CCS2','Type2','CHAdeMO','GBT','CCS1','Type1')),
  current_type        text not null check (current_type in ('AC','DC')),
  power_kw            numeric(6,1) not null check (power_kw > 0 and power_kw <= 400),
  status              text not null default 'Unknown',
  status_updated_at   timestamptz not null default now(),
  tariff_id           text references public.tariffs(id) on delete set null,
  unique (charger_id, ocpp_connector_id)
);
create index if not exists connectors_station_idx on public.connectors(station_id);
create index if not exists connectors_status_idx on public.connectors(status);

create table if not exists public.verification_records (
  id           uuid primary key default gen_random_uuid(),
  station_id   text not null references public.stations(id) on delete cascade,
  reviewer_id  uuid references public.profiles(id),
  decision     public.listing_status not null,
  note         text,
  document_paths text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists verification_station_idx on public.verification_records(station_id);

create table if not exists public.qr_codes (
  token         text primary key check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  station_id    text not null references public.stations(id) on delete cascade,
  connector_id  text references public.connectors(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  expires_at    timestamptz
);
create index if not exists qr_station_idx on public.qr_codes(station_id);
-- At most one active permanent code per target (duplicate handling).
create unique index if not exists qr_one_active_per_target on public.qr_codes(station_id, coalesce(connector_id,'')) where revoked_at is null and expires_at is null;

-- ---------------------------------------------------------------- vehicles
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  make         text not null,
  model        text not null,
  nickname     text,
  battery_kwh  numeric(6,1) check (battery_kwh > 0 and battery_kwh <= 250),
  connectors   text[] not null check (cardinality(connectors) >= 1),
  body_type    text not null default 'sedan' check (body_type in ('sedan','suv','hatch','trike','van')),
  plate        text,
  is_selected  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists vehicles_user_idx on public.vehicles(user_id);

-- ---------------------------------------------------------------- payments
create table if not exists public.payment_methods (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  provider        text not null check (provider in ('gcash','maya','card','qrph')),
  label           text not null,
  last4           text check (last4 ~ '^[0-9]{4}$'),
  provider_token  text not null, -- tokenized reference from the provider; never a PAN/CVV
  created_at      timestamptz not null default now()
);
create index if not exists payment_methods_user_idx on public.payment_methods(user_id);

create table if not exists public.charging_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete restrict,
  station_id              text not null references public.stations(id),
  connector_id            text not null references public.connectors(id),
  charger_identity        text not null,
  state                   public.session_state not null default 'created',
  limit_php               numeric(10,2) not null check (limit_php > 0 and limit_php <= 1500),
  price_per_kwh           numeric(8,2) not null check (price_per_kwh > 0),
  payment_transaction_id  uuid,
  ocpp_transaction_id     text,
  id_tag                  text,
  meter_start_wh          bigint,
  meter_stop_wh           bigint,
  energy_wh               numeric(14,1) not null default 0 check (energy_wh >= 0),
  power_w                 numeric(12,1) not null default 0,
  cost_php                numeric(10,2) not null default 0 check (cost_php >= 0),
  started_at              timestamptz,
  stopped_at              timestamptz,
  stop_reason             text,
  is_simulated            boolean not null default false,
  error                   text,
  created_at              timestamptz not null default now(),
  constraint sessions_cost_le_limit check (state <> 'completed' or cost_php <= limit_php)
);
create index if not exists sessions_user_idx on public.charging_sessions(user_id, created_at desc);
create index if not exists sessions_station_idx on public.charging_sessions(station_id, created_at desc);
create index if not exists sessions_state_idx on public.charging_sessions(state);
-- Only one active session per connector.
create unique index if not exists sessions_one_active_per_connector on public.charging_sessions(connector_id)
  where state in ('authorizing','authorized','starting','charging','stopping');

create table if not exists public.meter_values (
  id          bigserial primary key,
  session_id  uuid not null references public.charging_sessions(id) on delete cascade,
  at          timestamptz not null,
  energy_wh   bigint,
  power_w     numeric(12,1),
  soc         numeric(5,2)
);
create index if not exists meter_values_session_idx on public.meter_values(session_id, at);

create table if not exists public.payment_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete restrict,
  session_id       uuid references public.charging_sessions(id),
  provider         text not null check (provider in ('demo','gcash','maya','card','qrph')),
  state            public.payment_state not null default 'created',
  hold_amount      numeric(10,2) not null check (hold_amount > 0 and hold_amount <= 1500),
  captured_amount  numeric(10,2) check (captured_amount >= 0),
  idempotency_key  text not null unique,
  provider_ref     text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint payments_capture_le_hold check (captured_amount is null or captured_amount <= hold_amount)
);
create index if not exists payments_user_idx on public.payment_transactions(user_id, created_at desc);
create index if not exists payments_session_idx on public.payment_transactions(session_id);
alter table public.charging_sessions
  drop constraint if exists sessions_payment_fk,
  add constraint sessions_payment_fk foreign key (payment_transaction_id) references public.payment_transactions(id);

-- Enforce the payment state machine at the database level too.
create or replace function public.enforce_payment_transition()
returns trigger language plpgsql as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    ok := case old.state
      when 'created' then new.state in ('pending','authorized','failed')
      when 'pending' then new.state in ('authorized','failed')
      when 'authorized' then new.state in ('captured','voided','failed')
      when 'captured' then new.state in ('partially_refunded','refunded')
      when 'partially_refunded' then new.state in ('partially_refunded','refunded')
      else false end;
    if not ok then raise exception 'invalid payment transition % -> %', old.state, new.state; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists payment_transition on public.payment_transactions;
create trigger payment_transition before update on public.payment_transactions for each row execute function public.enforce_payment_transition();

create table if not exists public.webhook_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  event_id         text not null,
  signature_valid  boolean not null,
  payload          jsonb not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  unique (provider, event_id) -- idempotent webhook processing
);

create table if not exists public.refunds (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payment_transactions(id),
  amount      numeric(10,2) not null check (amount > 0),
  state       text not null default 'requested' check (state in ('requested','processing','succeeded','failed')),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists refunds_payment_idx on public.refunds(payment_id);

-- ---------------------------------------------------------------- operations
create table if not exists public.alerts (
  id                uuid primary key default gen_random_uuid(),
  at                timestamptz not null default now(),
  severity          text not null check (severity in ('info','warning','critical')),
  charger_identity  text,
  station_id        text references public.stations(id) on delete set null,
  message           text not null,
  acknowledged      boolean not null default false
);
create index if not exists alerts_open_idx on public.alerts(acknowledged, at desc);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor_id    text not null,
  actor_role  text not null,
  action      text not null,
  target      text not null,
  detail      text
);
create index if not exists audit_at_idx on public.audit_logs(at desc);

-- Super-admin-only role assignment, audited.
create or replace function public.set_user_role(target uuid, new_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['super_admin']::public.app_role[]) then
    raise exception 'only a super administrator can change roles';
  end if;
  update public.profiles set role = new_role, updated_at = now() where id = target;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('role', new_role::text) where id = target;
  insert into public.audit_logs (actor_id, actor_role, action, target, detail)
  values (auth.uid()::text, 'super_admin', 'role.set', target::text, new_role::text);
end $$;
revoke all on function public.set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles             enable row level security;
alter table public.owners               enable row level security;
alter table public.stations             enable row level security;
alter table public.tariffs              enable row level security;
alter table public.chargers             enable row level security;
alter table public.charger_credentials  enable row level security;
alter table public.connectors           enable row level security;
alter table public.verification_records enable row level security;
alter table public.qr_codes             enable row level security;
alter table public.vehicles             enable row level security;
alter table public.payment_methods      enable row level security;
alter table public.charging_sessions    enable row level security;
alter table public.meter_values         enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.refunds              enable row level security;
alter table public.alerts               enable row level security;
alter table public.audit_logs           enable row level security;

-- profiles: read own (staff read all); users may only change their display name.
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_staff());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- owners
create policy owners_select on public.owners for select using (user_id = auth.uid() or public.is_admin());
create policy owners_insert on public.owners for insert with check (user_id = auth.uid());
create policy owners_update on public.owners for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- stations: approved are public; owners see/edit their own drafts; staff see all.
create policy stations_select on public.stations for select
  using (listing_status = 'approved' or owner_id = auth.uid() or public.is_staff());
create policy stations_owner_insert on public.stations for insert
  with check (owner_id = auth.uid() and listing_status = 'draft' and public.has_role(array['owner','super_admin']::public.app_role[]));
create policy stations_owner_update on public.stations for update
  using (owner_id = auth.uid() and listing_status in ('draft','rejected'))
  with check (owner_id = auth.uid() and listing_status in ('draft','pending'));
create policy stations_admin_update on public.stations for update using (public.is_admin()) with check (public.is_admin());

-- child tables follow station visibility (read-only for clients; writes via service role)
create policy tariffs_select on public.tariffs for select
  using (exists (select 1 from public.stations s where s.id = station_id and (s.listing_status = 'approved' or s.owner_id = auth.uid() or public.is_staff())));
create policy chargers_select on public.chargers for select
  using (exists (select 1 from public.stations s where s.id = station_id and (s.listing_status = 'approved' or s.owner_id = auth.uid() or public.is_staff())));
create policy connectors_select on public.connectors for select
  using (exists (select 1 from public.stations s where s.id = station_id and (s.listing_status = 'approved' or s.owner_id = auth.uid() or public.is_staff())));
-- charger_credentials: intentionally no policies (service role only).

create policy verification_select on public.verification_records for select
  using (public.is_admin() or exists (select 1 from public.stations s where s.id = station_id and s.owner_id = auth.uid()));
create policy verification_admin_insert on public.verification_records for insert with check (public.is_admin());

create policy qr_select on public.qr_codes for select
  using (public.is_staff() or exists (select 1 from public.stations s where s.id = station_id and s.owner_id = auth.uid()));

-- vehicles: fully owned by the driver
create policy vehicles_all on public.vehicles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- payment methods: own only (tokens come from the provider)
create policy pm_select on public.payment_methods for select using (user_id = auth.uid());
create policy pm_insert on public.payment_methods for insert with check (user_id = auth.uid());
create policy pm_delete on public.payment_methods for delete using (user_id = auth.uid());

-- sessions / payments / meter values: read own; staff read all; no client writes.
create policy sessions_select on public.charging_sessions for select using (user_id = auth.uid() or public.is_staff());
create policy payments_select on public.payment_transactions for select using (user_id = auth.uid() or public.is_admin());
create policy meter_select on public.meter_values for select
  using (exists (select 1 from public.charging_sessions cs where cs.id = session_id and (cs.user_id = auth.uid() or public.is_staff())));
create policy refunds_select on public.refunds for select
  using (public.is_admin() or exists (select 1 from public.payment_transactions p where p.id = payment_id and p.user_id = auth.uid()));
-- webhook_events: no policies (service role only).

create policy alerts_select on public.alerts for select using (public.is_staff());
create policy alerts_ack on public.alerts for update using (public.is_staff()) with check (public.is_staff());
create policy audit_select on public.audit_logs for select using (public.is_admin());
