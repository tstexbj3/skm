import { getTranslations } from "next-intl/server";
import { MessageSquareText } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import { SlipCard, type PendingSlipRow } from "@/components/line-slips/slip-card";

type SlipRow = PendingSlipRow & {
  line_user_id: string;
  image_path: string | null;
};

export default async function LineSlipsPage() {
  await requireModule("payments");
  const supabase = await createClient();

  const { data: slipsData } = await supabase
    .from("line_pending_slips")
    .select(
      "id, line_user_id, display_name, sender_name, amount, image_path, created_at"
    )
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });
  const slips = (slipsData ?? []) as SlipRow[];

  const { data: links } = await supabase
    .from("line_user_rooms")
    .select("user_id, room");
  const linkedRoom = new Map((links ?? []).map((l) => [l.user_id, l.room]));

  // One batch call signs every slip image at once.
  const paths = slips
    .map((s) => s.image_path)
    .filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from(PAYMENT_SLIPS_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  const t = await getTranslations("lineSlips");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MessageSquareText className="size-6 text-muted-foreground" />
          {t("title")}
          {slips.length > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-sm font-medium text-white">
              {slips.length}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {slips.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {slips.map((s) => (
            <SlipCard
              key={s.id}
              slip={s}
              imageUrl={s.image_path ? signed.get(s.image_path) ?? null : null}
              defaultRoom={linkedRoom.get(s.line_user_id) ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
