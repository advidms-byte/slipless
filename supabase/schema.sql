-- ============================================================
-- RingBack — Supabase Schema
-- Idempotent version: safe to re-run in Supabase SQL editor
-- ============================================================

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new', 'in-progress', 'booked', 'lead', 'lost');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type message_direction as enum ('inbound', 'outbound');
  end if;
end $$;

create table if not exists waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz default now()
);

create table if not exists businesses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  phone_number     text not null,
  twilio_number    text unique,
  ai_persona_name  text not null default 'Alex',
  ai_persona_tone  text not null default 'Friendly, professional, and concise',
  calendar_url     text,
  timezone         text not null default 'America/Chicago',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  caller_phone      text not null,
  caller_name       text,
  service_requested text,
  status            lead_status not null default 'new',
  appointment_at    timestamptz,
  call_sid          text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  direction   message_direction not null,
  body        text not null,
  twilio_sid  text,
  created_at  timestamptz default now()
);

create index if not exists leads_business_id_idx on leads(business_id);
create index if not exists leads_caller_phone_idx on leads(caller_phone);
create index if not exists leads_status_idx on leads(status);
create index if not exists messages_lead_id_idx on messages(lead_id);
create index if not exists messages_business_id_idx on messages(business_id);
create index if not exists businesses_twilio_number_idx on businesses(twilio_number);
create index if not exists businesses_owner_id_idx on businesses(owner_id);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists businesses_updated_at on businesses;
create trigger businesses_updated_at
  before update on businesses
  for each row execute function update_updated_at();

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

alter table businesses enable row level security;
alter table leads      enable row level security;
alter table messages   enable row level security;
alter table waitlist   enable row level security;

drop policy if exists "owner can manage their business" on businesses;
create policy "owner can manage their business"
  on businesses for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owner can manage their leads" on leads;
create policy "owner can manage their leads"
  on leads for all
  using (
    business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  )
  with check (
    business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "owner can manage their messages" on messages;
create policy "owner can manage their messages"
  on messages for all
  using (
    business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  )
  with check (
    business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "anyone can join waitlist" on waitlist;
create policy "anyone can join waitlist"
  on waitlist for insert
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
