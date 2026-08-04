"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printBill } from "@/app/(app)/billing/actions";

export function PrintButton({
  label,
  billId,
}: {
  label: string;
  billId?: string;
}) {
  function onClick() {
    // Mark printed (fire-and-forget) then print synchronously so mobile
    // browsers keep the user-gesture and allow window.print().
    if (billId) {
      const fd = new FormData();
      fd.set("id", billId);
      void printBill({}, fd);
    }
    window.print();
  }

  return (
    <Button onClick={onClick} className="print:hidden">
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
