# CLAUDE.md — SKM Apartment / Dormitory Management

Guidance for any agent or developer working in this repo. Read before writing code.

## Tech stack (decided — do not substitute)

- **Next.js (App Router) + TypeScript**, responsive (desktop + mobile).
- **Tailwind CSS v4 + shadcn/ui** for UI.
- **Supabase** — Postgres, Auth, Storage (images), Row-Level Security.
- **Resend** — transactional email.
- **next-intl** — Thai/English switchable UI (default **Thai**).
- **LINE Messaging API + slip-verification API (SlipOK / EasySlip)** — auto-read
  transfer slips sent to the Official Account into pending payments (v1).
- **Deploy**: Vercel + Supabase cloud.

## HARD RULES — never violate

1. **Money is always `numeric`/decimal** (or integer satang). **NEVER floats.**
   Every money column is `numeric(12,2)`; rates that need precision are `numeric(12,4)`.
2. **Issued bills are IMMUTABLE SNAPSHOTS.** When a bill is created, copy the rate
   values (room rent, water unit rate, electricity unit rate, VAT) onto the bill row.
   Changing a rate later must **NOT** change past bills. Never recompute an issued
   bill from live rates.
3. **Roles enforced at the DB with RLS, not just the UI.**
   - **OWNER** can edit and approve everything.
   - **ADMIN** can create records and **propose edits, but every edit is STAGED
     as a `change_request` and only goes live once OWNER approves.** ADMIN never
     updates a live business row directly (no UPDATE policy); it inserts a
     `change_requests` row holding `before_data`/`after_data`. On approval the
     owner's server action applies `after_data` to the row; the change_request
     (before + after) is **kept forever** as history.
   - The one editing exception: ADMIN may edit a **bill while it is `DRAFT`**
     (that is how a bill gets filled in) and may advance `DRAFT → SENT`. Once a bill
     leaves `DRAFT`, ADMIN can no longer touch it.
   - **OWNER controls, per module, what ADMIN may do** via `admin_permissions`.
     This gate is enforced in RLS through `admin_can('<module>')` on INSERT
     policies — not just hidden in the UI. Modules: `tenants`, `rooms`, `billing`,
     `payments`, `expenses`, `reports`, `moveouts`.
   - **HR / salary is OWNER-ONLY and not togglable.** `staff_members` is owner
     read/write only, and SALARY expenses require `is_owner()`. ADMIN has no HR
     access at all.
   - **Owner-approval workflows** (all DB-enforced, owner-only updates): bills
     (`SENT → APPROVED`), payments (`RECORDED → APPROVED`), expenses
     (`PENDING_APPROVAL → APPROVED`), move-outs (`NOTIFIED → APPROVED`). Expenses
     with no bill photo require the owner to acknowledge (`no_bill_ack`) — the UI
     warns **"NO BILL ON THIS PAYMENT"** first.
4. **VOID, never DELETE**, for voidable line items and reversible records.
   No table grants `DELETE`; no RLS policy allows it. Reverse things via `status`.
5. **Keep an audit trail** — `created_by`, `created_at`, `status`, `status_changed_at`
   on bills, payments, move-outs (and everywhere it is cheap to add).
6. **Model workflows as explicit status state machines**, not in-place edits:
   - Bill: `DRAFT → SENT → APPROVED → PRINTED` (reprints tracked by `print_count`).
   - Payment: `RECORDED → APPROVED → RECONCILED` (or `VOID`).
   - Expense: `PENDING_APPROVAL → APPROVED` (or `VOID`).
   - Move-out: `NOTIFIED → APPROVED → COMPLETED` (or `FLED`).
   - Cash deposit: `PENDING → MATCHED` (or `VOID`).
   - Change request (staged edit): `PENDING → APPROVED` (or `REJECTED`).

## Conventions

- **Security boundary is RLS.** The browser and server clients use the **anon key**;
  the DB decides what a user can do. Never ship the service-role key to the client.
- **New tables**: add `created_by uuid references profiles(id)`, `created_at`, enable
  RLS, and add policies following the pattern in the init migration
  (`staff read`, `staff create`, `owner update`, no delete).
- **Schema changes go through migrations** in `supabase/migrations/`. Never hand-edit
  the live DB. Generate with `supabase db diff` or write the file, then `db reset` locally.
- **Snapshots on write**: any workflow that "freezes" a value (bill rates, deposit at
  move-out) copies the value into its own column at that moment.
- **Path alias** `@/*` → `src/*`. UI in `src/components`, shadcn in `src/components/ui`.
- **Roles helpers in SQL**: `is_owner()`, `is_admin()`, `is_staff()`, `current_role_name()`.

## Build order

Schema + seed first (done), reviewed before UI. Then features are built as
**vertical slices** (one module end-to-end: DB → server action → UI) in the order of
`docs/spec.md`.

## Local dev

```bash
npm install
supabase start          # local Postgres + Auth + Storage (needs Docker)
supabase db reset        # apply migrations + seed
npm run dev              # http://localhost:3000
```

Seed logins (password `password123`): `owner@skm.local` (OWNER), `admin@skm.local` (ADMIN).
