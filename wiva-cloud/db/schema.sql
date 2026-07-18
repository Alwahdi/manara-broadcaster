create extension if not exists pgcrypto;

create table if not exists wiva_cloud_tenants (
  id uuid primary key,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','expired')),
  plan text not null default 'trial',
  viewer_limit integer not null default 0 check (viewer_limit >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wiva_cloud_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('licensed_hls','licensed_xtream','licensed_vod')),
  credentials_cipher text not null,
  rights_reference text not null,
  redistribution_attested boolean not null default false,
  status text not null default 'disabled'
    check (status in ('disabled','active','degraded','blocked')),
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wiva_cloud_providers_tenant_idx
  on wiva_cloud_providers(tenant_id, priority, name);

create table if not exists wiva_cloud_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  provider_id uuid references wiva_cloud_providers(id) on delete set null,
  provider_asset_ref text not null,
  parent_asset_id uuid references wiva_cloud_assets(id) on delete cascade,
  season_number integer,
  episode_number integer,
  delivery_mode text not null default 'auto' check (delivery_mode in ('auto','copy','transcode')),
  kind text not null check (kind in ('live','movie','series')),
  title text not null,
  description text not null default '',
  category text not null default '',
  artwork_url text,
  backdrop_url text,
  year integer,
  rating numeric(3,1),
  quality text not null default 'HD',
  language text not null default '',
  sort_order integer not null default 100,
  is_featured boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, provider_id, provider_asset_ref)
);

create index if not exists wiva_cloud_assets_catalog_idx
  on wiva_cloud_assets(tenant_id, kind, is_active, sort_order, title);

alter table wiva_cloud_assets add column if not exists parent_asset_id uuid references wiva_cloud_assets(id) on delete cascade;
alter table wiva_cloud_assets add column if not exists season_number integer;
alter table wiva_cloud_assets add column if not exists episode_number integer;
alter table wiva_cloud_assets add column if not exists delivery_mode text not null default 'auto';
create index if not exists wiva_cloud_assets_parent_idx on wiva_cloud_assets(tenant_id, parent_asset_id, season_number, episode_number);

create table if not exists wiva_cloud_viewers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text not null,
  status text not null default 'active'
    check (status in ('pending','active','blocked','expired')),
  max_concurrent_streams integer not null default 1 check (max_concurrent_streams between 1 and 10),
  expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wiva_cloud_viewers_tenant_email_idx
  on wiva_cloud_viewers(tenant_id, lower(email));

create table if not exists wiva_cloud_viewer_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  viewer_id uuid not null references wiva_cloud_viewers(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  ip_hash text not null default '',
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists wiva_cloud_sessions_expiry_idx
  on wiva_cloud_viewer_sessions(expires_at);

create table if not exists wiva_cloud_payment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  viewer_id uuid not null references wiva_cloud_viewers(id) on delete cascade,
  method text not null default 'bank_transfer' check (method in ('bank_transfer')),
  amount numeric(12,2),
  currency text not null default 'USD',
  transfer_reference text not null,
  note text not null default '',
  requested_days integer not null default 30 check (requested_days between 1 and 365),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wiva_cloud_payment_requests_tenant_time_idx
  on wiva_cloud_payment_requests(tenant_id, status, created_at desc);

create table if not exists wiva_cloud_audit_log (
  id bigserial primary key,
  tenant_id uuid not null references wiva_cloud_tenants(id) on delete cascade,
  actor_type text not null,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wiva_cloud_audit_tenant_time_idx
  on wiva_cloud_audit_log(tenant_id, created_at desc);

create or replace function wiva_cloud_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wiva_cloud_tenants_updated_at on wiva_cloud_tenants;
create trigger wiva_cloud_tenants_updated_at before update on wiva_cloud_tenants
for each row execute function wiva_cloud_set_updated_at();

drop trigger if exists wiva_cloud_providers_updated_at on wiva_cloud_providers;
create trigger wiva_cloud_providers_updated_at before update on wiva_cloud_providers
for each row execute function wiva_cloud_set_updated_at();

drop trigger if exists wiva_cloud_assets_updated_at on wiva_cloud_assets;
create trigger wiva_cloud_assets_updated_at before update on wiva_cloud_assets
for each row execute function wiva_cloud_set_updated_at();

drop trigger if exists wiva_cloud_viewers_updated_at on wiva_cloud_viewers;
create trigger wiva_cloud_viewers_updated_at before update on wiva_cloud_viewers
for each row execute function wiva_cloud_set_updated_at();
