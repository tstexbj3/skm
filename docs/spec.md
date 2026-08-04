# SKM — Requirements Specification (สุขเกษมแมนชั่น)

Source of truth for _what_ each module does. Hard architectural rules live in
[`CLAUDE.md`](../CLAUDE.md); the physical schema lives in `supabase/migrations/`.

**Property:** 48 rooms — **45 residential** + **3 shop** units, different price per room.
**UI languages:** Thai (default) / English, switchable (`next-intl`).

---

## 0. Roles, permissions & the edit-approval model

- **OWNER** edits and approves everything.
- **ADMIN** creates records and **proposes edits**. ADMIN never changes a live
  business row directly.
- **Per-module switchboard** (`admin_permissions`, OWNER-controlled): OWNER toggles
  ADMIN access to each module — `tenants`, `rooms`, `billing`, `payments`, `expenses`,
  `reports`, `moveouts`. Enforced at the DB via `admin_can('<module>')` on INSERT
  policies (not just hidden menus).
- **HR / salary is OWNER-ONLY and not togglable.** The `staff_members` roster and SALARY
  expenses are owner read/write only; ADMIN has no access to HR at all (RLS-enforced).
- **Staged edits** (`change_requests`): when ADMIN edits an existing record, the change
  is saved as a `change_request` (`before_data` + `after_data`, status `PENDING`). **The
  live record does not change** until OWNER approves; then the owner's action applies
  `after_data`. The before/after pair is **kept forever** as history. (Chosen model:
  _stage until approved_.)
- **Approvals are owner-only, DB-enforced**: bills, payments, expenses, move-outs.

---

## 1. Tenant & Contract (at signing)

**Tenant** (`tenants`): name, phone, photo, national ID image, co-tenant name,
co-tenant national ID image.

**Contract** (`contracts`): tenant ↔ room, contract scan, `occupant_count` (for
per-person water), start date, status. **Two deposit buckets:**

| Bucket | Column | Rule |
|---|---|---|
| **Advance rent** (เงินล่วงหน้า) | `advance_rent_amount` / `advance_rent_paid` | One month prepaid; **covers the last month** before move-out. **Tops up when rent increases** (tenant pays the difference). |
| **Damage deposit** (เงินมัดจำ) | `damage_deposit_amount` / `damage_deposit_paid` | Refundable if nothing is broken; **fixed at signing** (does _not_ change on rent increase). |

Flow: customer agrees → record all customer info + tie to room → collect advance +
damage deposit → store records and document scans (Supabase Storage) → room becomes
`OCCUPIED`. OWNER can look up, edit (directly), and approve. ADMIN edits go through
`change_requests`.

---

## 2. Billing (rent + water + electricity + late fee + other)

One `bills` row per contract per billing month (`unique (contract_id, billing_month)`),
an **immutable snapshot** — all rates/modes copied onto the row at creation. Matches the
printed **ใบแจ้งหนี้**.

| Form label (TH) | Column(s) |
|---|---|
| วันที่ | `bill_date` (1st of month) |
| เรียน | `payer_name` (snapshot) |
| ห้อง | `room_number` (snapshot) |
| ค่าเช่าห้องพัก | `rent_amount` (snapshot of `rooms.rent_rate`) |
| ค่าน้ำ | `water_billing_mode`, `water_rate`, `water_persons` **or** `water_start`/`water_end`, `water_vat_rate`, `water_amount` |
| ค่าไฟฟ้า (เลขมิเตอร์) | `elec_unit_rate`, `elec_start`, `elec_end`, `elec_vat_rate`, `elec_amount` |
| ค่าปรับล่าช้าตั้งแต่วันที่ | `late_fee_since_date`, `late_fee_amount` |
| ค่าใช้จ่ายอื่นๆ | `other_charge_label`, `other_charge_amount` |
| _(recurring add-ons: TV, fridge…)_ | `bill_line_items` (from `recurring_charges`) |
| รวม | `total_amount` |
| หมายเหตุ / ผู้รับเงิน | `note`, `received_by`, `received_at` |

**Water — two modes** (`rooms.water_billing_mode`, snapshotted per bill):
- **PER_PERSON** (this building = **100 ฿/person**): `water_amount = water_rate × occupant_count`.
- **PER_UNIT** (shops / other places): `water_amount = (water_end − water_start) × water_rate × (1 + water_vat_rate)`.

**Electricity** — building-wide unit rate (`utility_rates.electricity_unit_rate`):
`elec_amount = (elec_end − elec_start) × elec_unit_rate × (1 + elec_vat_rate)`.
On the **last day of the month** the admin reads the meter and enters `elec_end`;
`elec_start` auto-fills from the prior month's `elec_end` (0 if none).

**Recurring add-ons** (`recurring_charges` per contract, e.g. TV/fridge) are copied onto
each bill as `bill_line_items` with `include_in_total = true`.

**Total (รวม)** = `rent_amount + water_amount + elec_amount + late_fee_amount +
other_charge_amount` + all `ACTIVE` `bill_line_items` flagged `include_in_total`.

> **Confirmed:** 7% VAT applies to metered water/electricity (snapshot per bill; set to
> 0 for the flat 100฿/person water if desired). Late fee is a **manual amount** + date.

### 2b. Bill issuance & printing

State machine `DRAFT → SENT → APPROVED → PRINTED`:
1. ADMIN fills (`DRAFT`) → **Send** (`SENT`). 2. OWNER **Approves** (`APPROVED`).
3. **Print** appears: first print → `PRINTED`, `print_count = 1`; further prints
   increment `print_count` and are labelled **"Reprint"**.

**Bulk vs individual print**: on the 1st, generate all of next month's bills at once and
**print all**, or print an individual bill. (Both are actions over the same `bills` rows.)

---

## 3. Payments (partial or full)

`payments` — a bill can have **many** payments (partial allowed); outstanding balance =
bill total − sum of approved payments.

- **Transfer** → attach transfer slip. **Cash** → attach photo of cash. (`slip_image_url`)
- **Workflow** `RECORDED → APPROVED → RECONCILED` (or `VOID`): ADMIN records the amount →
  **OWNER approves** the payment.
- **Cash reconciliation** (`cash_deposits`): total outstanding cash; when handed to the
  OWNER, attach deposit slip; `amount` must **match** `expected_cash_balance` → deposit
  `MATCHED` and covered payments `RECONCILED` (`cash_deposit_id` set).

### 3b. LINE auto-slip (v1)

Customer sends the transfer slip to the **LINE Official Account**. Flow: LINE Messaging
API webhook → fetch image → **slip-verification API (SlipOK / EasySlip)** returns
verified `amount` / `slip_ref` / `slip_sender` / `slip_bank` / timestamp (and confirms
the slip is genuine) → create a `payments` row with `source = LINE_AUTO` and the verified
fields, status `RECORDED`. Admin confirms the room/bill match; OWNER approves. Manual
entry (`source = MANUAL`) remains available as fallback. _(Requires a LINE OA + a slip-API
subscription; built as its own vertical slice.)_

---

## 4. Expenses (all spending)

`expenses` — ADMIN records every expense with a **bill photo**, category, amount, and a
room number **or** common area (`is_common_area`). Categories: **SALARY, ELECTRICITY,
WATER, DEPOSIT_RETURN, MAINTENANCE, INTERNET, OTHER**.

- **Approval** `PENDING_APPROVAL → APPROVED` (or `VOID`) — **OWNER approves every expense.**
- **No bill photo** → UI warns **"⚠️ NO BILL ON THIS PAYMENT"**; OWNER must acknowledge
  (`no_bill_ack`) before approving.
- **SALARY is OWNER-ONLY (HR module).** Admin cannot create SALARY expenses or see HR at
  all — RLS blocks it (`category = 'SALARY'` requires `is_owner()`; the `staff_members`
  roster is owner read/write only). Salary may be flagged `deduct_from_income` to deduct
  from income, and links to a `staff_members` row via `staff_member_id`.
- **MAINTENANCE / materials** attach a photo of the item (`item_image_url`) + the bill.
- **DEPOSIT_RETURN** links to the move-out (`moveout_id`) when a tenant leaves.

---

## 5. Back-office reports

- **Room charges summary** (`report_summaries`, `ROOM_CHARGES`): month's charges into a
  saved sheet (`data` jsonb snapshot).
- **Room status sheet** (`ROOM_STATUS`): occupancy with `occupancy_rate`, from
  `rooms.status`.
- **Room status colors**: **OCCUPIED 🔴 red**, **VACANT 🟢 green**,
  **PENDING_MOVEOUT 🔵 blue**.
- **Expense ledger**: filter/sum `expenses` by room / common area / category, with images.

---

## 6. Move-out

`move_outs`, `NOTIFIED → APPROVED → COMPLETED` (or `FLED`); **OWNER approves**.

1. Tenant must give **≥ 30 days notice**. ADMIN clicks **Notify move-out** (`NOTIFIED`);
   room → `PENDING_MOVEOUT` (🔵). `notice_days` / `sufficient_notice` are generated columns.
2. **≥ 30 days**: last month's rent is **covered by the advance rent** (`advance_applied`,
   `last_month_rent`). Enter **damage deductions** for anything broken (`damage_deductions`,
   0 if none). **Damage deposit refund** = `damage_deposit_snapshot − damage_deductions`
   → prompt to refund; a `DEPOSIT_RETURN` expense records the payout.
3. **< 30 days**: **RED flag** "deposit not refunded" (ไม่คืนมัดจำ) — `red_flag_no_refund`.
4. **Flees (หนี)**: `fled = true`, status `FLED`; gather ALL of that tenant's data and
   **email it to the owner** at `sahapap.pht@gmail.com` (Resend).
5. **Completion** (`COMPLETED`): contract `ENDED`, room reset to `VACANT` (🟢), ready for a
   new contract.

---

## Storage buckets

| Bucket | Contents |
|---|---|
| `tenant-media` | tenant photo, national ID images, contract scan |
| `payment-slips` | transfer slips, cash photos, cash-deposit slips |
| `expense-media` | expense bill images, purchased-item photos |

All private; served via signed URLs from the server.

---

## Build order (vertical slices)

1. **Auth + role routing + i18n shell** (login, session, ADMIN/OWNER menus, TH/EN toggle).
2. **Rooms** — 48-room floor grid to set per-room price + water mode + status.
3. **Tenant & Contract** — signing form, image uploads, deposits.
4. **Billing** — bill form, water/elec/late/other, recurring add-ons, issuance + print (bulk/individual).
5. **Payments** — record (partial/full) + owner approval + cash reconciliation.
6. **LINE auto-slip** — OA webhook + slip verification → pending payments.
7. **Expenses** — categories, bill-photo warning, owner approval.
8. **Move-out** — deposit-return calc, fled-tenant email.
9. **Reports** — room charges, room status, expense ledger.
10. **Permissions UI + change-request review** — owner switchboard + approve/reject edits.
