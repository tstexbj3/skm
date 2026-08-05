/**
 * EasySlip slip-verification adapter.
 * Docs: https://document.easyslip.com/documents/verify/bank/image
 *   POST https://developer.easyslip.com/api/v1/verify
 *   Authorization: Bearer <EASYSLIP_TOKEN>
 *   multipart/form-data  field "file" = slip image
 *
 * Response field paths are read defensively (with fallbacks) so a minor shape
 * change from EasySlip degrades gracefully instead of throwing. The raw payload
 * is returned so we can confirm the exact shape against the first real slip.
 */

export type SlipData = {
  ref: string | null; // bank transaction reference (dedupe key)
  amount: number | null;
  senderName: string | null;
  bank: string | null;
  receiverAccount: string | null;
  raw: unknown;
};

type EasySlipName = { th?: string; en?: string };
type EasySlipData = {
  transRef?: string;
  ref1?: string;
  amount?: number | { amount?: number };
  sender?: {
    bank?: { name?: string; short?: string };
    account?: { name?: EasySlipName };
  };
  receiver?: {
    account?: { bank?: { account?: string }; proxy?: { account?: string } };
  };
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function verifySlipImage(
  image: Buffer,
  token: string
): Promise<{ ok: boolean; data?: SlipData; error?: string }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(image)]), "slip.jpg");
  form.append("checkDuplicate", "false");

  let res: Response;
  try {
    res = await fetch("https://developer.easyslip.com/api/v1/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    return { ok: false, error: "network" };
  }

  const json = (await res.json().catch(() => null)) as {
    data?: EasySlipData;
    message?: string;
  } | null;

  if (!res.ok || !json?.data) {
    return { ok: false, error: json?.message ?? `http_${res.status}` };
  }

  const d = json.data;
  const amount =
    typeof d.amount === "object" ? toNumber(d.amount?.amount) : toNumber(d.amount);

  return {
    ok: true,
    data: {
      ref: d.transRef ?? d.ref1 ?? null,
      amount,
      senderName: d.sender?.account?.name?.th ?? d.sender?.account?.name?.en ?? null,
      bank: d.sender?.bank?.name ?? d.sender?.bank?.short ?? null,
      receiverAccount:
        d.receiver?.account?.bank?.account ??
        d.receiver?.account?.proxy?.account ??
        null,
      raw: json,
    },
  };
}
