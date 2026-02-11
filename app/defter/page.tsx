import { DefterClient } from "@/components/defter/DefterClient";
import {
  applyPaymentsToBalances,
  applyPaymentsToTransfers,
  computeBalances,
  computeDirectTransfersFromPurchases,
  netPairTransfers
} from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/team";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthBounds(month: string) {
  const [year, monthPart] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthPart - 1, 1));
  const end = new Date(Date.UTC(year, monthPart, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export default async function DefterPage({
  searchParams
}: {
  searchParams: { month?: string };
}) {
  const { membership, user } = await requireMembership();
  const month = searchParams.month ?? getCurrentMonth();
  const { start, end } = getMonthBounds(month);

  const supabase = await createClient();
  const { data: people } = await supabase
    .from("people")
    .select("id, name")
    .eq("team_id", membership.team_id);

  const peopleMap = Object.fromEntries((people ?? []).map((person) => [person.id, person.name]));
  const { data: mePerson } = await supabase
    .from("people")
    .select("id, name")
    .eq("team_id", membership.team_id)
    .eq("linked_user_id", user.id)
    .maybeSingle();

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_type, purchase_splits(person_id, amount, people(name))")
    .eq("team_id", membership.team_id)
    .order("date", { ascending: false });

  const normalized = (purchases ?? []).map((purchase) => ({
    id: purchase.id,
    date: purchase.date,
    purchase_type: purchase.purchase_type === "munchies" ? "munchies" : "satin_alim",
    total_amount: Number(purchase.total_amount),
    splits: (purchase.purchase_splits ?? []).map((split) => {
      const personRelation = split.people as { name: string } | { name: string }[] | null;
      const personName = Array.isArray(personRelation)
        ? personRelation[0]?.name ?? "Bilinmiyor"
        : personRelation?.name ?? "Bilinmiyor";

      return {
        person_id: split.person_id,
        person_name: personName,
        amount: Number(split.amount)
      };
    })
  }));

  const { data: paymentRows } = await supabase
    .from("settlement_payments")
    .select("id, from_person_id, to_person_id, amount, paid_at, note, status, requested_by_person_id, confirmed_by_person_id, confirmed_at")
    .eq("team_id", membership.team_id)
    .order("paid_at", { ascending: false });

  const normalizedPayments = (paymentRows ?? []).map((row) => ({
    id: row.id,
    from_person_id: row.from_person_id,
    to_person_id: row.to_person_id,
    from_name: peopleMap[row.from_person_id] ?? "Bilinmiyor",
    to_name: peopleMap[row.to_person_id] ?? "Bilinmiyor",
    amount: Number(row.amount),
    paid_at: row.paid_at,
    note: row.note,
    status: row.status ?? "confirmed",
    requested_by_person_id: row.requested_by_person_id,
    requested_by_name: row.requested_by_person_id ? peopleMap[row.requested_by_person_id] ?? "Bilinmiyor" : null,
    confirmed_by_person_id: row.confirmed_by_person_id,
    confirmed_by_name: row.confirmed_by_person_id ? peopleMap[row.confirmed_by_person_id] ?? "Bilinmiyor" : null,
    confirmed_at: row.confirmed_at
  }));

  const confirmedPayments = normalizedPayments.filter((item) => item.status === "confirmed");

  const allBalances = applyPaymentsToBalances(
    computeBalances(normalized),
    confirmedPayments.map((item) => ({
      from_person_id: item.from_person_id,
      to_person_id: item.to_person_id,
      amount: item.amount
    })),
    peopleMap
  );
  const allTransfers = netPairTransfers(
    applyPaymentsToTransfers(
      computeDirectTransfersFromPurchases(normalized),
      confirmedPayments.map((item) => ({
        from_person_id: item.from_person_id,
        to_person_id: item.to_person_id,
        amount: item.amount
      })),
      peopleMap
    )
  );
  const allSpend = normalized.reduce((sum, item) => sum + item.total_amount, 0);

  const periodPurchases = normalized.filter((purchase) => purchase.date >= start && purchase.date < end);
  const periodPayments = confirmedPayments.filter((item) => item.paid_at >= start && item.paid_at < end);
  const periodBalances = applyPaymentsToBalances(
    computeBalances(periodPurchases),
    periodPayments.map((item) => ({
      from_person_id: item.from_person_id,
      to_person_id: item.to_person_id,
      amount: item.amount
    })),
    peopleMap
  );
  const periodTransfers = netPairTransfers(
    applyPaymentsToTransfers(
      computeDirectTransfersFromPurchases(periodPurchases),
      periodPayments.map((item) => ({
        from_person_id: item.from_person_id,
        to_person_id: item.to_person_id,
        amount: item.amount
      })),
      peopleMap
    )
  );
  const periodSpend = periodPurchases.reduce((sum, item) => sum + item.total_amount, 0);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Defter</h1>
          <p className="muted" style={{ margin: 0 }}>Net borc/alacak ozeti</p>
        </div>
        <form method="get" className="row" style={{ width: "auto", gap: 8 }}>
          <input className="input" type="month" name="month" defaultValue={month} style={{ width: 180 }} />
          <button className="button" type="submit" style={{ width: "auto" }}>
            Uygula
          </button>
        </form>
      </div>

      <DefterClient
        month={month}
        allSpend={allSpend}
        allCount={normalized.length}
        periodSpend={periodSpend}
        periodCount={periodPurchases.length}
        allTransfers={allTransfers}
        periodTransfers={periodTransfers}
        allBalances={allBalances}
        periodBalances={periodBalances}
        paymentLogs={normalizedPayments}
        mePersonId={mePerson?.id ?? null}
        mePersonName={mePerson?.name ?? null}
        teamId={membership.team_id}
      />
    </div>
  );
}
