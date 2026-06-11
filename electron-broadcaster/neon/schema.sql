create extension if not exists pgcrypto;

create table if not exists cloud_iptv_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  logo_url text,
  category text,
  headers jsonb not null default '{}'::jsonb,
  transfer_limit_bytes bigint not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cloud_iptv_active_sort_idx
  on cloud_iptv_channels (is_active, sort_order, name);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cloud_iptv_channels_updated_at on cloud_iptv_channels;
create trigger cloud_iptv_channels_updated_at
before update on cloud_iptv_channels
for each row execute function set_updated_at();

create table if not exists platform_app_instances (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  machine_fingerprint text not null unique,
  hardware_id text not null,
  tenant_name text not null,
  contact_email text not null,
  contact_phone text,
  hostname text,
  app_version text,
  install_channel text not null default 'stable',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'expired')),
  plan text not null default 'pending',
  features jsonb not null default jsonb_build_object(
    'channels', false,
    'iptv', false,
    'media', false,
    'webAdmin', false,
    'analytics', false,
    'branding', false
  ),
  max_devices integer not null default 1,
  subscription_expires_at timestamptz,
  activated_at timestamptz,
  support_note text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_app_instances_status_idx
  on platform_app_instances (status, subscription_expires_at);

create index if not exists platform_app_instances_contact_idx
  on platform_app_instances (lower(contact_email));

drop trigger if exists platform_app_instances_updated_at on platform_app_instances;
create trigger platform_app_instances_updated_at
before update on platform_app_instances
for each row execute function set_updated_at();

create table if not exists platform_update_policies (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'stable',
  latest_version text not null,
  minimum_version text not null default '0.0.0',
  mandatory boolean not null default false,
  notes text,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_update_policies_channel_idx
  on platform_update_policies (channel, is_active, created_at desc);

drop trigger if exists platform_update_policies_updated_at on platform_update_policies;
create trigger platform_update_policies_updated_at
before update on platform_update_policies
for each row execute function set_updated_at();

insert into platform_update_policies (channel, latest_version, minimum_version, mandatory, notes, is_active)
values
  ('stable', '2.5.11', '2.5.0', false, 'Stable channel with automatic background updates.', true),
  ('beta', '2.5.11', '2.5.0', false, 'Beta channel for early customer testing.', true)
on conflict do nothing;

insert into cloud_iptv_channels (name, url, category, sort_order, is_active)
values
  ('Apple BipBop 16:9 Demo', 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8', 'Demo', 10, true),
  ('Apple BipBop 4:3 Demo', 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8', 'Demo', 20, true),
  ('Mux HLS Test', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'Demo', 30, true)
on conflict do nothing;
