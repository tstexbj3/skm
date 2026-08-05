/**
 * EasySlip slip-verification adapter — API v2.
 * Docs: https://document.easyslip.com/en/v2/verify/bank/image
 *   POST https://api.easyslip.com/v2/verify/bank
 *   Authorization: Bearer <EASYSLIP_TOKEN>
 *   multipart/form-data  field "image" = slip image
 *
 * v2 wraps the slip under data.rawSlip (v1 had it directly under data), so we
 * read from data.rawSlip and fall back to data for resilience. The raw payload
 * is returned so we can confirm the exact shape from the Vercel log.
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
type EasySlipSlip = {
  transRef?: string;
  ref1?: string;
  amount?: number | { amount?: number };
  sender?: {
    bank?: { name?: string; short?: string };
    account?: { name?: EasySlipName };
  };
  receiver?: {
    bank?: { name?: string; short?: string };
    account?: {
      name?: EasySlipName;
      bank?: { account?: string };
      proxy?: { account?: string };
    };
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
  form.append("image", new Blob([new Uint8Array(image)]), "slip.jpg");
  form.append("checkDuplicate", "false");

  let res: Response;
  try {
    res = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    return { ok: false, error: "network" };
  }

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { rawSlip?: EasySlipSlip } & EasySlipSlip;
    message?: string;
  } | null;

  if (!res.ok || !json?.data) {
    return { ok: false, error: json?.message ?? `http_${res.status}` };
  }

  // v2 nests under data.rawSlip; fall back to data for older/other shapes.
  const d: EasySlipSlip = json.data.rawSlip ?? json.data;
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
