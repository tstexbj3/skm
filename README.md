# SKM — Apartment / Dormitory Management

Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres, Auth,
Storage, RLS) · Resend. Deploys to Vercel + Supabase cloud.

See [`docs/spec.md`](docs/spec.md) for requirements and [`CLAUDE.md`](CLAUDE.md) for the
hard rules.

## 0. One-time: install the toolchain (this machine doesn't have it yet)

This repo was scaffolded as files; you need Node and (optionally) the Supabase CLI + Git.

1. **Node.js LTS (20+)** — https://nodejs.org (the Windows `.msi` installer). Reopen your
   terminal after installing, then verify: `node -v` and `npm -v`.
2. **Git** (for version control / Vercel) — https://git-scm.com/download/win.
3. **Docker Desktop** — required only for the **local** Supabase stack.
4. **Supabase CLI** — `npm install -g supabase` (or scoop/brew).

> If you'd rather skip local Supabase, you can point `.env.local` at a free
> **Supabase cloud** project instead and run only `npm run dev`.

## 1. Install & configure

```bash
npm install
cp .env.example .env.local   # then fill in the values
```

## 2. Database (local)

```bash
supabase start      # boots Postgres + Auth + Storage in Docker
supabase db reset    # applies migrations in supabase/migrations + seed.sql
```

`supabase start` prints your local **API URL** and **anon key** — put them in
`.env.local`. Studio runs at http://127.0.0.1:54323, and local email is captured at
http://127.0.0.1:54324 (Inbucket).

**Seed logins** (password `password123`):

- `owner@skm.local` — OWNER (edit + approve everything)
- `admin@skm.local` — ADMIN (create only)

## 3. Run

```bash
npm run dev          # http://localhost:3000
```

## 4. Deploy

**Database (Supabase cloud):**

```bash
supabase link --project-ref <your-ref>
supabase db push                     # pushes migrations to the cloud project
```

Create the three Storage buckets from `supabase/config.toml` (`tenant-media`,
`payment-slips`, `expense-media`) in the dashboard, private.

**App (Vercel):** import the Git repo, then set env vars from `.env.example`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OWNER_NOTIFY_EMAIL`). Vercel auto-detects Next.js.

## Project layout

```
src/
  app/                     App Router (layout, pages)
  components/ui/           shadcn/ui components
  lib/
    supabase/              browser + server + middleware clients (@supabase/ssr)
    email/                 Resend helper
    utils.ts               cn() helper
middleware.ts              refreshes the Supabase session / gates auth
supabase/
  config.toml              local stack + storage buckets
  migrations/              schema + RLS (source of truth)
  seed.sql                 local test data
docs/spec.md               requirements by module
CLAUDE.md                  hard rules
```

## Scripts

| Command            | Does                                    |
| ------------------ | --------------------------------------- |
| `npm run dev`      | Next dev server                         |
| `npm run build`    | Production build                        |
| `npm run lint`     | ESLint                                  |
| `npm run typecheck`| `tsc --noEmit`                          |
| `npm run db:reset` | Reapply migrations + seed (local)       |
| `npm run db:push`  | Push migrations to linked cloud project |
