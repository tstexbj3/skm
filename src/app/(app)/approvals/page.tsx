import { requireOwner } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function ApprovalsPage() {
  await requireOwner();
  return <ModulePlaceholder navKey="approvals" ownerOnly />;
}
