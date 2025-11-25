# CivicAi Autobot v2 (multi-inbox + warmup)

## 1. SQL in Supabase

Draai dit in de SQL editor:

```sql
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  email text,
  name text,
  company text,
  role text,
  linkedin_url text,
  tags text[],
  created_at timestamptz default now()
);

create table if not exists marketing_jobs (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  status text not null default 'pending',
  lead_id uuid references leads(id),
  payload jsonb not null,
  result jsonb,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_outbox (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id),
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft',
  error text,
  campaign_name text,
  from_email text,
  sender_id uuid,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists linkedin_content (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  lead_id uuid references leads(id),
  content text not null,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sender_accounts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  display_name text,
  warmup_start_date date default current_date,
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into sender_accounts (email, display_name, warmup_start_date) values
  ('outreach@civicaihq.com', 'Teun from CivicAi', current_date),
  ('hello@civicaihq.com', 'Teun from CivicAi', current_date),
  ('founder@civicaihq.com', 'Teun from CivicAi', current_date),
  ('team@civicaihq.com', 'Teun from CivicAi', current_date);
```
Warmup schema (per inbox):

- Dag 0–1: 5 mails
- Dag 2: 8
- Dag 3: 12
- Dag 4: 20
- Dag 5: 30
- Dag 6+: 50 per dag

## 2. .env.local

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key

CRON_SECRET=your_long_random_string

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ceo@civicai-solutions.com
SMTP_PASS=your_app_password
```

## 3. Vercel Cron

1. `/api/cron-processJobs` elke 5-10 minuten
2. `/api/cron-sendEmails` elke 10-15 minuten

Header: `Authorization: Bearer YOUR_CRON_SECRET`

## 4. Starten

```bash
npm install
npm run dev
```

Open http://localhost:3000
