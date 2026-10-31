# Prompt: full system test + cleanup for SKM

> Copy everything below this line and paste it as your first message to Claude
> (Claude Code opened in this project folder, or a Cowork session with this
> folder added). Answer Claude's questions as it walks you through the test.

---

You are helping me test my apartment-management app end-to-end, find bugs, and
clean up the test data afterwards. Work step by step and wait for me between
steps — I will be clicking the app while you guide me.

## Context (read first)

- This folder is the SKM app (สุขเกษมแมนชั่น, 48 rooms). Read `CLAUDE.md`
  (hard rules) and `docs/spec.md` (what each module does) before anything else.
- It is LIVE in production with REAL tenant data: the app runs on Vercel
  (auto-deploys when you push to `main`), the database is Supabase cloud.
  `.env.local` has the credentials; `npm run db:apply` applies migrations to it.
- I am not a developer. Explain things in plain language (Thai labels are fine),
  do the technical steps yourself, and tell me exactly where to click.
- Owner login: `owner@skm.local`. There is also an admin account for testing the
  two-role workflow. I test on the live site, on desktop and on my phone.

## Safety rules — never break these

1. THE SITE HOLDS REAL DATA. NEVER delete, void, edit, or "clean up" ANY record
   that existed before this test session — no matter how much it looks like
   test data. Cleanup applies ONLY to records WE create during this session.
2. All test records must be clearly marked: use tenant name `ทดสอบ TEST`,
   and pick a VACANT room I confirm is free. Keep a running list of every
   record we create (tenant, bill, payments, expenses, move-out) — that list,
   and nothing else, is what gets cleaned in Part 3.
3. Schema changes only via migration files + `npm run db:apply`, never by
   hand-editing the live DB (CLAUDE.md rule).
4. After any code fix: `npm run typecheck`, `npm run lint`, `npm run build`
   must all pass before you commit and push.

## Part 1 — guided full-loop test

Walk me through this on the live site, one step at a time, and after each step
ask me what I saw. Record anything that fails, confuses me, or looks wrong in a
running list (we fix them in Part 2).

1. **Sign a test tenant**: new contract for tenant `ทดสอบ TEST` on the vacant
   room I give you, with a photo, ID image, and a multi-page contract scan
   (test both ถ่ายรูป and เลือกไฟล์ buttons, on my phone too).
2. **Edit the tenant**: change the phone number; add one more contract page;
   remove a page. Check the ประวัติการแก้ไข (history) shows the changes.
3. **Bill**: create this month's bill for the test room, enter meter readings
   (also try the batch page /billing/meters), send it, approve it as owner,
   print it (check the printout), print again (should say Reprint).
4. **Payments**: record a PARTIAL cash payment, approve it, check the billing
   list shows the outstanding remainder; then pay the rest and approve.
5. **Expense**: record one expense WITH a bill photo and one WITHOUT (the
   no-bill warning must appear and I must acknowledge it to approve).
6. **Move-out**: notify move-out on the test room, enter a small damage
   deduction, approve, complete. The room must return to ว่าง (green).
7. **Dashboard & reports**: check the dashboard counts and the reports page
   reflect everything we just did.
8. **LINE slip (only if I say my EasySlip credit is active)**: I send a real
   bank slip to the OA from my LINE; verify the payment appears. Note: this
   links my LINE account to the test room — the cleanup MUST unlink it.

## Part 2 — fix what we found

Go through the list of problems from Part 1. For each: explain the cause in one
sentence, fix it in code, run typecheck/lint/build, then commit and push (that
deploys it). If a fix needs a DB migration, write the migration file and apply
it with `npm run db:apply` at the same time as the push. After the deploy, have
me retest that item.

## Part 3 — clean up ONLY this session's test data (order matters)

Delete nothing but the records on the running list from Part 1 — the ones WE
created in this session. Show me that exact list and wait for my OK first.
Anything not on the list stays untouched. Then, as owner, in this order:

1. VOID every test payment (approved ones must be voided before the bill can go).
2. DELETE the test bill(s) from the bill detail page (this also removes slip
   images from storage).
3. VOID the test expenses. If I want zero trace, hard-delete those rows via SQL
   and remove their images from the `expense-media` bucket.
4. PURGE the test tenant from the tenant page (deletes contracts, move-outs,
   scans, and frees the room). If purge refuses with `has_financials`, a test
   bill still exists — go back to step 2.
5. LINE leftovers via SQL on the cloud DB (no UI exists for these):
   `delete from line_pending_slips where line_user_id = '<my test LINE id>';`
   `delete from line_user_rooms where line_user_id = '<my test LINE id>';`
   (If you skip this, my personal LINE stays linked to the test room and a real
   slip from me would book against it!)
6. Run `npm run storage:gc` DRY RUN ONLY and show me the list. Do not pass
   `--delete` unless I explicitly approve every file on that list — orphaned
   files may belong to real records.
7. Verify: test room is ว่าง, test tenant gone from ผู้เช่า, no test rows left
   in billing/payments/expenses/moveouts, dashboard counts back to normal.
   The purge entry in `deletion_logs` is supposed to remain — that's the audit
   trail.

## Part 4 — report

Finish with a short plain-language summary: what we tested, what was broken and
is now fixed (with commit ids), what is still open, and your top 3 suggestions
for what to improve next.
