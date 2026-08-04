/** All categories (for labels). SALARY is owner-only and handled in HR. */
export const EXPENSE_CATEGORIES = [
  "ELECTRICITY",
  "WATER",
  "DEPOSIT_RETURN",
  "MAINTENANCE",
  "INTERNET",
  "OTHER",
  "SALARY",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Categories a staff member may record here (SALARY is via HR). */
export const FORM_CATEGORIES: ExpenseCategory[] = [
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "MAINTENANCE",
  "DEPOSIT_RETURN",
  "OTHER",
];

export const EXPENSE_STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "border-transparent bg-amber-500 text-white",
  APPROVED: "border-transparent bg-emerald-600 text-white",
  VOID: "border-transparent bg-muted text-muted-foreground",
};
