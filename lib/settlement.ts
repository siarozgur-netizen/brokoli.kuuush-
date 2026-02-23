export type SettlementSplit = {
  person_id: string;
  person_name: string;
  amount: number;
};

export type SettlementPurchase = {
  id: string;
  total_amount: number;
  splits: SettlementSplit[];
};

export type PersonBalance = {
  person_id: string;
  person_name: string;
  paid: number;
  owed: number;
  net: number;
};

export type SettlementTransfer = {
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  amount: number;
};

export type SettlementPayment = {
  from_person_id: string;
  to_person_id: string;
  amount: number;
};

const MIN_TRANSFER_AMOUNT = 20;
const MIN_TRANSFER_CENTS = MIN_TRANSFER_AMOUNT * 100;
const EPS_CENTS = 1;

const toCents = (value: number) => Math.round((Number(value) || 0) * 100);
const fromCents = (value: number) => Number((value / 100).toFixed(2));

function getEffectivePurchaseTotalCents(purchase: SettlementPurchase) {
  const splitsTotalCents = purchase.splits.reduce((sum, split) => sum + toCents(split.amount), 0);
  const purchaseTotalCents = toCents(purchase.total_amount);

  // Legacy safety: if stored total is stale/incorrect, trust split totals.
  if (splitsTotalCents > 0 && Math.abs(splitsTotalCents - purchaseTotalCents) > EPS_CENTS) {
    return splitsTotalCents;
  }
  return purchaseTotalCents;
}

function equalSharesCents(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function computeBalances(purchases: SettlementPurchase[]): PersonBalance[] {
  const byPerson = new Map<string, { person_id: string; person_name: string; paid_cents: number; owed_cents: number }>();

  purchases.forEach((purchase) => {
    if (!purchase.splits.length) return;

    const effectiveTotalCents = getEffectivePurchaseTotalCents(purchase);
    const sharesCents = equalSharesCents(effectiveTotalCents, purchase.splits.length);

    purchase.splits.forEach((split, index) => {
      const current = byPerson.get(split.person_id) ?? {
        person_id: split.person_id,
        person_name: split.person_name,
        paid_cents: 0,
        owed_cents: 0
      };

      current.paid_cents += toCents(split.amount);
      current.owed_cents += sharesCents[index];
      byPerson.set(split.person_id, current);
    });
  });

  return [...byPerson.values()]
    .map((person) => ({
      person_id: person.person_id,
      person_name: person.person_name,
      paid: fromCents(person.paid_cents),
      owed: fromCents(person.owed_cents),
      net: fromCents(person.paid_cents - person.owed_cents)
    }))
    .sort((a, b) => b.net - a.net);
}

export function computeTransfers(balances: PersonBalance[]): SettlementTransfer[] {
  const creditors = balances
    .map((person) => ({
      person_id: person.person_id,
      person_name: person.person_name,
      net_cents: toCents(person.net)
    }))
    .filter((person) => person.net_cents > EPS_CENTS)
    .sort((a, b) => b.net_cents - a.net_cents);

  const debtors = balances
    .map((person) => ({
      person_id: person.person_id,
      person_name: person.person_name,
      debt_cents: Math.abs(toCents(person.net))
    }))
    .filter((person) => person.debt_cents > EPS_CENTS)
    .sort((a, b) => b.debt_cents - a.debt_cents);

  const transfers: SettlementTransfer[] = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const creditor = creditors[c];
    const debtor = debtors[d];

    const amountCents = Math.min(creditor.net_cents, debtor.debt_cents);

    if (amountCents >= MIN_TRANSFER_CENTS) {
      transfers.push({
        from_id: debtor.person_id,
        from_name: debtor.person_name,
        to_id: creditor.person_id,
        to_name: creditor.person_name,
        amount: fromCents(amountCents)
      });
    }

    creditor.net_cents -= amountCents;
    debtor.debt_cents -= amountCents;

    if (creditor.net_cents <= EPS_CENTS) c += 1;
    if (debtor.debt_cents <= EPS_CENTS) d += 1;
  }

  return transfers;
}

export function computeDirectTransfersFromPurchases(purchases: SettlementPurchase[]): SettlementTransfer[] {
  const pairAmountCents = new Map<string, number>();
  const pairMeta = new Map<string, { from_id: string; from_name: string; to_id: string; to_name: string }>();

  const addTransfer = (transfer: SettlementTransfer) => {
    const key = `${transfer.from_id}::${transfer.to_id}`;
    const current = pairAmountCents.get(key) ?? 0;
    pairAmountCents.set(key, current + toCents(transfer.amount));
    pairMeta.set(key, {
      from_id: transfer.from_id,
      from_name: transfer.from_name,
      to_id: transfer.to_id,
      to_name: transfer.to_name
    });
  };

  purchases.forEach((purchase) => {
    if (!purchase.splits.length) return;

    const effectiveTotalCents = getEffectivePurchaseTotalCents(purchase);
    const sharesCents = equalSharesCents(effectiveTotalCents, purchase.splits.length);
    const creditors: Array<{ person_id: string; person_name: string; amount_cents: number }> = [];
    const debtors: Array<{ person_id: string; person_name: string; amount_cents: number }> = [];

    purchase.splits.forEach((split, index) => {
      const deltaCents = toCents(split.amount) - sharesCents[index];
      if (deltaCents > EPS_CENTS) {
        creditors.push({
          person_id: split.person_id,
          person_name: split.person_name,
          amount_cents: deltaCents
        });
      } else if (deltaCents < -EPS_CENTS) {
        debtors.push({
          person_id: split.person_id,
          person_name: split.person_name,
          amount_cents: Math.abs(deltaCents)
        });
      }
    });

    let c = 0;
    let d = 0;
    while (c < creditors.length && d < debtors.length) {
      const creditor = creditors[c];
      const debtor = debtors[d];
      const amountCents = Math.min(creditor.amount_cents, debtor.amount_cents);

      if (amountCents > EPS_CENTS) {
        addTransfer({
          from_id: debtor.person_id,
          from_name: debtor.person_name,
          to_id: creditor.person_id,
          to_name: creditor.person_name,
          amount: fromCents(amountCents)
        });
      }

      creditor.amount_cents -= amountCents;
      debtor.amount_cents -= amountCents;

      if (creditor.amount_cents <= EPS_CENTS) c += 1;
      if (debtor.amount_cents <= EPS_CENTS) d += 1;
    }
  });

  return [...pairAmountCents.entries()]
    .flatMap(([key, amountCents]) => {
      const meta = pairMeta.get(key);
      if (!meta) return [];
      const next: SettlementTransfer = {
        from_id: meta.from_id,
        from_name: meta.from_name,
        to_id: meta.to_id,
        to_name: meta.to_name,
        amount: fromCents(amountCents)
      };
      return toCents(next.amount) >= MIN_TRANSFER_CENTS ? [next] : [];
    })
    .sort((a, b) => b.amount - a.amount);
}

export function applyPaymentsToTransfers(
  transfers: SettlementTransfer[],
  payments: SettlementPayment[],
  names?: Record<string, string>
) {
  const pairAmountCents = new Map<string, number>();
  const pairMeta = new Map<string, { from_id: string; from_name: string; to_id: string; to_name: string }>();

  transfers.forEach((transfer) => {
    const key = `${transfer.from_id}::${transfer.to_id}`;
    pairAmountCents.set(key, (pairAmountCents.get(key) ?? 0) + toCents(transfer.amount));
    pairMeta.set(key, {
      from_id: transfer.from_id,
      from_name: transfer.from_name,
      to_id: transfer.to_id,
      to_name: transfer.to_name
    });
  });

  payments.forEach((payment) => {
    const key = `${payment.from_person_id}::${payment.to_person_id}`;
    const current = pairAmountCents.get(key) ?? 0;
    const next = current - toCents(payment.amount);
    const fromName = names?.[payment.from_person_id] ?? pairMeta.get(key)?.from_name ?? "Bilinmiyor";
    const toName = names?.[payment.to_person_id] ?? pairMeta.get(key)?.to_name ?? "Bilinmiyor";

    if (next >= MIN_TRANSFER_CENTS) {
      pairAmountCents.set(key, next);
      pairMeta.set(key, {
        from_id: payment.from_person_id,
        from_name: fromName,
        to_id: payment.to_person_id,
        to_name: toName
      });
      return;
    }

    pairAmountCents.delete(key);
    pairMeta.delete(key);
  });

  return [...pairAmountCents.entries()]
    .flatMap(([key, amountCents]) => {
      const meta = pairMeta.get(key);
      if (!meta) return [];
      const next: SettlementTransfer = {
        from_id: meta.from_id,
        from_name: meta.from_name,
        to_id: meta.to_id,
        to_name: meta.to_name,
        amount: fromCents(amountCents)
      };
      return toCents(next.amount) >= MIN_TRANSFER_CENTS ? [next] : [];
    })
    .sort((a, b) => b.amount - a.amount);
}

export function normalizePaymentsForCurrentDebts(
  transfers: SettlementTransfer[],
  payments: SettlementPayment[]
) {
  const remainingByPair = new Map<string, number>();
  transfers.forEach((item) => {
    const key = `${item.from_id}::${item.to_id}`;
    remainingByPair.set(key, (remainingByPair.get(key) ?? 0) + toCents(item.amount));
  });

  const normalized: SettlementPayment[] = [];
  payments.forEach((payment) => {
    const key = `${payment.from_person_id}::${payment.to_person_id}`;
    const remaining = remainingByPair.get(key) ?? 0;
    if (remaining <= EPS_CENTS) return;

    const appliedCents = Math.min(remaining, toCents(payment.amount));
    if (appliedCents <= EPS_CENTS) return;

    normalized.push({
      from_person_id: payment.from_person_id,
      to_person_id: payment.to_person_id,
      amount: fromCents(appliedCents)
    });
    remainingByPair.set(key, remaining - appliedCents);
  });

  return normalized;
}

export function netPairTransfers(transfers: SettlementTransfer[]) {
  const pairMap = new Map<string, number>();
  const names = new Map<string, string>();

  transfers.forEach((item) => {
    names.set(item.from_id, item.from_name);
    names.set(item.to_id, item.to_name);

    const [a, b] = [item.from_id, item.to_id].sort();
    const key = `${a}::${b}`;
    const signed = item.from_id === a ? toCents(item.amount) : -toCents(item.amount);
    pairMap.set(key, (pairMap.get(key) ?? 0) + signed);
  });

  const result: SettlementTransfer[] = [];
  pairMap.forEach((signedAmountCents, key) => {
    if (Math.abs(signedAmountCents) < MIN_TRANSFER_CENTS) return;
    const [a, b] = key.split("::");

    if (signedAmountCents > 0) {
      result.push({
        from_id: a,
        from_name: names.get(a) ?? "Bilinmiyor",
        to_id: b,
        to_name: names.get(b) ?? "Bilinmiyor",
        amount: fromCents(Math.abs(signedAmountCents))
      });
      return;
    }

    result.push({
      from_id: b,
      from_name: names.get(b) ?? "Bilinmiyor",
      to_id: a,
      to_name: names.get(a) ?? "Bilinmiyor",
      amount: fromCents(Math.abs(signedAmountCents))
    });
  });

  return result.sort((left, right) => right.amount - left.amount);
}

export function applyPaymentsToBalances(
  balances: PersonBalance[],
  payments: SettlementPayment[],
  names?: Record<string, string>
) {
  const byPerson = new Map<string, { person_id: string; person_name: string; paid_cents: number; owed_cents: number }>();

  balances.forEach((balance) => {
    byPerson.set(balance.person_id, {
      person_id: balance.person_id,
      person_name: balance.person_name,
      paid_cents: toCents(balance.paid),
      owed_cents: toCents(balance.owed)
    });
  });

  payments.forEach((payment) => {
    const fromCurrent = byPerson.get(payment.from_person_id) ?? {
      person_id: payment.from_person_id,
      person_name: names?.[payment.from_person_id] ?? "Bilinmiyor",
      paid_cents: 0,
      owed_cents: 0
    };

    const toCurrent = byPerson.get(payment.to_person_id) ?? {
      person_id: payment.to_person_id,
      person_name: names?.[payment.to_person_id] ?? "Bilinmiyor",
      paid_cents: 0,
      owed_cents: 0
    };

    const paymentCents = toCents(payment.amount);
    fromCurrent.paid_cents += paymentCents;
    toCurrent.owed_cents += paymentCents;

    byPerson.set(fromCurrent.person_id, fromCurrent);
    byPerson.set(toCurrent.person_id, toCurrent);
  });

  return [...byPerson.values()]
    .map((person) => ({
      person_id: person.person_id,
      person_name: person.person_name,
      paid: fromCents(person.paid_cents),
      owed: fromCents(person.owed_cents),
      net: fromCents(person.paid_cents - person.owed_cents)
    }))
    .sort((a, b) => b.net - a.net);
}
