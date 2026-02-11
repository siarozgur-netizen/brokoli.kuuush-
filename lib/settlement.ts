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

const round2 = (value: number) => Number(value.toFixed(2));
const MIN_TRANSFER_AMOUNT = 20;

function equalShares(totalAmount: number, count: number) {
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  return Array.from({ length: count }, (_, index) =>
    (base + (index === count - 1 ? remainder : 0)) / 100
  );
}

export function computeBalances(purchases: SettlementPurchase[]): PersonBalance[] {
  const byPerson = new Map<string, PersonBalance>();

  purchases.forEach((purchase) => {
    if (!purchase.splits.length) return;

    const shares = equalShares(purchase.total_amount, purchase.splits.length);

    purchase.splits.forEach((split, index) => {
      const current = byPerson.get(split.person_id) ?? {
        person_id: split.person_id,
        person_name: split.person_name,
        paid: 0,
        owed: 0,
        net: 0
      };

      current.paid += Number(split.amount);
      current.owed += shares[index];
      byPerson.set(split.person_id, current);
    });
  });

  const balances = [...byPerson.values()].map((person) => ({
    ...person,
    paid: round2(person.paid),
    owed: round2(person.owed),
    net: round2(person.paid - person.owed)
  }));

  return balances.sort((a, b) => b.net - a.net);
}

export function computeTransfers(balances: PersonBalance[]): SettlementTransfer[] {
  const creditors = balances
    .filter((person) => person.net > 0.009)
    .map((person) => ({ ...person }))
    .sort((a, b) => b.net - a.net);

  const debtors = balances
    .filter((person) => person.net < -0.009)
    .map((person) => ({ ...person, net: Math.abs(person.net) }))
    .sort((a, b) => b.net - a.net);

  const transfers: SettlementTransfer[] = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const creditor = creditors[c];
    const debtor = debtors[d];

    const amount = round2(Math.min(creditor.net, debtor.net));

    if (amount >= MIN_TRANSFER_AMOUNT) {
      transfers.push({
        from_id: debtor.person_id,
        from_name: debtor.person_name,
        to_id: creditor.person_id,
        to_name: creditor.person_name,
        amount
      });
    }

    creditor.net = round2(creditor.net - amount);
    debtor.net = round2(debtor.net - amount);

    if (creditor.net <= 0.009) c += 1;
    if (debtor.net <= 0.009) d += 1;
  }

  return transfers;
}

export function computeDirectTransfersFromPurchases(purchases: SettlementPurchase[]): SettlementTransfer[] {
  const transferMap = new Map<string, SettlementTransfer>();

  const addTransfer = (transfer: SettlementTransfer) => {
    const key = `${transfer.from_id}::${transfer.to_id}`;
    const current = transferMap.get(key);
    if (!current) {
      transferMap.set(key, { ...transfer, amount: round2(transfer.amount) });
      return;
    }
    current.amount = round2(current.amount + transfer.amount);
    transferMap.set(key, current);
  };

  purchases.forEach((purchase) => {
    if (!purchase.splits.length) return;

    const shares = equalShares(purchase.total_amount, purchase.splits.length);
    const creditors: Array<{ person_id: string; person_name: string; amount: number }> = [];
    const debtors: Array<{ person_id: string; person_name: string; amount: number }> = [];

    purchase.splits.forEach((split, index) => {
      const delta = round2(Number(split.amount) - shares[index]);
      if (delta > 0.009) {
        creditors.push({
          person_id: split.person_id,
          person_name: split.person_name,
          amount: delta
        });
      } else if (delta < -0.009) {
        debtors.push({
          person_id: split.person_id,
          person_name: split.person_name,
          amount: Math.abs(delta)
        });
      }
    });

    let c = 0;
    let d = 0;
    while (c < creditors.length && d < debtors.length) {
      const creditor = creditors[c];
      const debtor = debtors[d];
      const amount = round2(Math.min(creditor.amount, debtor.amount));

      if (amount > 0.009) {
        addTransfer({
          from_id: debtor.person_id,
          from_name: debtor.person_name,
          to_id: creditor.person_id,
          to_name: creditor.person_name,
          amount
        });
      }

      creditor.amount = round2(creditor.amount - amount);
      debtor.amount = round2(debtor.amount - amount);

      if (creditor.amount <= 0.009) c += 1;
      if (debtor.amount <= 0.009) d += 1;
    }
  });

  return [...transferMap.values()]
    .filter((item) => item.amount >= MIN_TRANSFER_AMOUNT)
    .sort((a, b) => b.amount - a.amount);
}

export function applyPaymentsToTransfers(
  transfers: SettlementTransfer[],
  payments: SettlementPayment[],
  names?: Record<string, string>
) {
  const transferMap = new Map<string, SettlementTransfer>();

  const addTransfer = (transfer: SettlementTransfer) => {
    const key = `${transfer.from_id}::${transfer.to_id}`;
    const current = transferMap.get(key);
    if (!current) {
      transferMap.set(key, { ...transfer, amount: round2(transfer.amount) });
      return;
    }
    current.amount = round2(current.amount + transfer.amount);
    transferMap.set(key, current);
  };

  transfers.forEach((transfer) => addTransfer(transfer));

  payments.forEach((payment) => {
    const key = `${payment.from_person_id}::${payment.to_person_id}`;
    const current = transferMap.get(key) ?? {
      from_id: payment.from_person_id,
      from_name: names?.[payment.from_person_id] ?? "Bilinmiyor",
      to_id: payment.to_person_id,
      to_name: names?.[payment.to_person_id] ?? "Bilinmiyor",
      amount: 0
    };

    const nextAmount = round2(current.amount - payment.amount);
    if (nextAmount >= MIN_TRANSFER_AMOUNT) {
      transferMap.set(key, { ...current, amount: nextAmount });
      return;
    }

    transferMap.delete(key);
  });

  return [...transferMap.values()]
    .filter((item) => item.amount >= MIN_TRANSFER_AMOUNT)
    .sort((a, b) => b.amount - a.amount);
}

export function netPairTransfers(transfers: SettlementTransfer[]) {
  const pairMap = new Map<string, number>();
  const names = new Map<string, string>();

  transfers.forEach((item) => {
    names.set(item.from_id, item.from_name);
    names.set(item.to_id, item.to_name);

    const [a, b] = [item.from_id, item.to_id].sort();
    const key = `${a}::${b}`;
    const current = pairMap.get(key) ?? 0;

    // Positive means a -> b, negative means b -> a
    const signed = item.from_id === a ? item.amount : -item.amount;
    pairMap.set(key, round2(current + signed));
  });

  const result: SettlementTransfer[] = [];
  pairMap.forEach((signedAmount, key) => {
    if (Math.abs(signedAmount) < MIN_TRANSFER_AMOUNT) return;
    const [a, b] = key.split("::");

    if (signedAmount > 0) {
      result.push({
        from_id: a,
        from_name: names.get(a) ?? "Bilinmiyor",
        to_id: b,
        to_name: names.get(b) ?? "Bilinmiyor",
        amount: round2(Math.abs(signedAmount))
      });
      return;
    }

    result.push({
      from_id: b,
      from_name: names.get(b) ?? "Bilinmiyor",
      to_id: a,
      to_name: names.get(a) ?? "Bilinmiyor",
      amount: round2(Math.abs(signedAmount))
    });
  });

  return result.sort((left, right) => right.amount - left.amount);
}

export function applyPaymentsToBalances(
  balances: PersonBalance[],
  payments: SettlementPayment[],
  names?: Record<string, string>
) {
  const byPerson = new Map<string, PersonBalance>();

  balances.forEach((balance) => {
    byPerson.set(balance.person_id, { ...balance });
  });

  payments.forEach((payment) => {
    const fromCurrent = byPerson.get(payment.from_person_id) ?? {
      person_id: payment.from_person_id,
      person_name: names?.[payment.from_person_id] ?? "Bilinmiyor",
      paid: 0,
      owed: 0,
      net: 0
    };

    const toCurrent = byPerson.get(payment.to_person_id) ?? {
      person_id: payment.to_person_id,
      person_name: names?.[payment.to_person_id] ?? "Bilinmiyor",
      paid: 0,
      owed: 0,
      net: 0
    };

    fromCurrent.paid += payment.amount;
    toCurrent.owed += payment.amount;

    byPerson.set(fromCurrent.person_id, fromCurrent);
    byPerson.set(toCurrent.person_id, toCurrent);
  });

  return [...byPerson.values()]
    .map((person) => ({
      ...person,
      paid: round2(person.paid),
      owed: round2(person.owed),
      net: round2(person.paid - person.owed)
    }))
    .sort((a, b) => b.net - a.net);
}
