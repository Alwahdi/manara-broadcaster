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

insert into cloud_iptv_channels (name, url, category, sort_order, is_active)
values
  ('Apple BipBop 16:9 Demo', 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8', 'Demo', 10, true),
  ('Apple BipBop 4:3 Demo', 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8', 'Demo', 20, true),
  ('Mux HLS Test', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'Demo', 30, true)
on conflict do nothing;
