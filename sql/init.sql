create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'bidder',
  approved boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  linkedin_url text,
  birthday date,
  location text,
  phone_number text,
  assigned_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists applies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company_name text not null,
  job_title text not null,
  job_site_url text not null,
  normalized_url text not null,
  created_at timestamptz not null default now(),
  unique(profile_id, normalized_url)
);

create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company text not null,
  tech_stacks text[] not null default '{}',
  processes text[] not null default '{}',
  current_step text,
  additional_info text,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_assigned_user on profiles(assigned_user_id);
create index if not exists idx_applies_profile on applies(profile_id);
create index if not exists idx_interviews_profile on interviews(profile_id);
create index if not exists idx_work_sessions_user on work_sessions(user_id);
