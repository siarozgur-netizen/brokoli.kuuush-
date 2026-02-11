import type { PurchaseSplitInput } from "@/types/domain";

type NormalizedSplit = {
  person_id: string;
  percentage: number;
  amount: number;
};
type NormalizeResult = { splits: NormalizedSplit[] } | { error: string };
type PurchaseType = "satin_alim" | "munchies";
type NormalizePurchasePayloadResult =
  | {
      date: string;
      total_amount: number;
      purchase_type: PurchaseType;
      splits: NormalizedSplit[];
    }
  | { error: string };

type NormalizeSettlementPaymentResult =
  | {
      from_person_id: string;
      to_person_id: string;
      amount: number;
      paid_at: string;
      note: string | null;
    }
  | { error: string };

const round2 = (value: number) => Number(value.toFixed(2));
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value: unknown, fallbackToday = false): string | null {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "";
  const candidate = raw || (fallbackToday ? new Date().toISOString().slice(0, 10) : "");
  if (!DATE_REGEX.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return candidate;
}

export function normalizePurchase(totalAmount: number, splits: PurchaseSplitInput[]): NormalizeResult {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { error: "Toplam tutar 0'dan buyuk olmali." };
  }

  if (!splits.length) {
    return { error: "En az bir katilimci secmelisiniz." };
  }

  const splitAmounts = splits.map((split) => ({
    person_id: split.person_id,
    amount: Number(split.amount)
  }));

  if (splitAmounts.some((split) => !Number.isFinite(split.amount) || split.amount < 0)) {
    return { error: "Katilimci TL degerleri negatif olamaz." };
  }

  if (splitAmounts.every((split) => split.amount === 0)) {
    return { error: "En az bir katilimcinin TL degeri 0'dan buyuk olmali." };
  }

  const totalSplitAmount = round2(splitAmounts.reduce((sum, split) => sum + split.amount, 0));
  if (Math.abs(totalSplitAmount - round2(totalAmount)) > 0.01) {
    return { error: "Katilimci TL toplami toplam tutara esit olmali." };
  }

  const normalized: NormalizedSplit[] = [];
  let percentageAccum = 0;

  splitAmounts.forEach((split, index) => {
    const normalizedAmount = round2(split.amount);
    if (index === splitAmounts.length - 1) {
      const lastPercentage = round2(100 - percentageAccum);
      normalized.push({
        person_id: split.person_id,
        amount: normalizedAmount,
        percentage: lastPercentage
      });
      return;
    }

    const percentage = round2((normalizedAmount / totalAmount) * 100);
    percentageAccum += percentage;

    normalized.push({
      person_id: split.person_id,
      amount: normalizedAmount,
      percentage
    });
  });

  if (normalized.some((split) => split.percentage < 0 || split.percentage > 100)) {
    return { error: "Dagilim gecersiz. Lutfen TL degerlerini kontrol edin." };
  }

  return { splits: normalized };
}

export function normalizePurchasePayload(body: unknown): NormalizePurchasePayloadResult {
  const payload = (body ?? {}) as Record<string, unknown>;
  const date = normalizeDate(payload.date);
  if (!date) {
    return { error: "Gecerli bir tarih zorunlu." };
  }

  const totalAmount = Number(payload.total_amount);
  const purchaseType: PurchaseType = payload.purchase_type === "munchies" ? "munchies" : "satin_alim";
  const rawSplits = (Array.isArray(payload.splits) ? payload.splits : []) as PurchaseSplitInput[];
  const normalizedPurchase = normalizePurchase(totalAmount, rawSplits);
  if ("error" in normalizedPurchase) {
    return normalizedPurchase;
  }

  return {
    date,
    total_amount: round2(totalAmount),
    purchase_type: purchaseType,
    splits: normalizedPurchase.splits
  };
}

export function normalizeSettlementPaymentPayload(body: unknown): NormalizeSettlementPaymentResult {
  const payload = (body ?? {}) as Record<string, unknown>;
  const fromPersonId = String(payload.from_person_id ?? "").trim();
  const toPersonId = String(payload.to_person_id ?? "").trim();
  const amount = round2(Number(payload.amount));
  const paidAt = normalizeDate(payload.paid_at, true);
  const noteRaw = typeof payload.note === "string" ? payload.note.trim() : "";
  const note = noteRaw ? noteRaw.slice(0, 500) : null;

  if (!fromPersonId || !toPersonId || fromPersonId === toPersonId) {
    return { error: "Gecerli gonderen ve alici secin." };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Odeme tutari 0'dan buyuk olmali." };
  }

  if (!paidAt) {
    return { error: "Gecerli bir odeme tarihi girin." };
  }

  return {
    from_person_id: fromPersonId,
    to_person_id: toPersonId,
    amount,
    paid_at: paidAt,
    note
  };
}
