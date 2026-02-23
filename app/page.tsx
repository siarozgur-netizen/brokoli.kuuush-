import Link from "next/link";
import { CalendarClient } from "@/components/calendar/CalendarClient";
import { formatTRY } from "@/lib/currency";
import {
  applyPaymentsToTransfers,
  computeDirectTransfersFromPurchases,
  netPairTransfers,
  normalizePaymentsForCurrentDebts
} from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/team";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { membership, user } = await requireMembership();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, name, is_active")
    .eq("team_id", membership.team_id)
    .order("name", { ascending: true });

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_type, created_by, purchase_splits(person_id, percentage, amount, people(name))")
    .eq("team_id", membership.team_id)
    .order("date", { ascending: false });

  const { data: paymentRows } = await supabase
    .from("settlement_payments")
    .select("from_person_id, to_person_id, amount, status, confirmed_by_person_id")
    .eq("team_id", membership.team_id);

  const { data: meAsPerson } = await supabase
    .from("people")
    .select("id, name")
    .eq("team_id", membership.team_id)
    .eq("linked_user_id", user.id)
    .maybeSingle();

  const normalizedPurchases = (purchases ?? []).map((purchase) => ({
    id: purchase.id,
    date: purchase.date,
    total_amount: Number(purchase.total_amount),
    purchase_type: (purchase.purchase_type === "munchies" ? "munchies" : "satin_alim") as "munchies" | "satin_alim",
    created_by: purchase.created_by,
    splits: (purchase.purchase_splits ?? []).map((split) => ({
      // Supabase nested relation can be object or single-item array depending on typing inference.
      person_name: (() => {
        const personRelation = split.people as { name: string } | { name: string }[] | null;
        return Array.isArray(personRelation) ? personRelation[0]?.name ?? "Bilinmiyor" : personRelation?.name ?? "Bilinmiyor";
      })(),
      person_id: split.person_id,
      percentage: Number(split.percentage),
      amount: Number(split.amount)
    }))
  }));

  const baseTransfers = computeDirectTransfersFromPurchases(
      normalizedPurchases.map((purchase) => ({
        id: purchase.id,
        total_amount: purchase.total_amount,
        splits: purchase.splits.map((split) => ({
          person_id: split.person_id,
          person_name: split.person_name,
          amount: split.amount
        }))
      }))
    );
  const confirmedPayments = (paymentRows ?? [])
    .filter((payment) => payment.status === "confirmed" && payment.confirmed_by_person_id)
    .map((payment) => ({
      from_person_id: payment.from_person_id,
      to_person_id: payment.to_person_id,
      amount: Number(payment.amount)
    }));
  const normalizedPayments = normalizePaymentsForCurrentDebts(baseTransfers, confirmedPayments);
  const nameMap = Object.fromEntries(
    normalizedPurchases
      .flatMap((purchase) => purchase.splits)
      .map((split) => [split.person_id, split.person_name])
  );
  const transfers = netPairTransfers(applyPaymentsToTransfers(baseTransfers, normalizedPayments, nameMap));

  const myReceivables = meAsPerson ? transfers.filter((item) => item.to_id === meAsPerson.id) : [];
  const myDebts = meAsPerson ? transfers.filter((item) => item.from_id === meAsPerson.id) : [];
  const myNet =
    myReceivables.reduce((sum, item) => sum + item.amount, 0) -
    myDebts.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Aylik Satin Alim Takvimi</h1>
      <div className="card net-summary-card">
        <div className="row net-summary-top">
          <div className="net-summary-main">
            <h3 className="net-summary-title">Kullanici Net Bakiye Ozeti</h3>
            {!meAsPerson ? (
              <p className="muted net-summary-muted">
                Hesabiniz henuz kisi listesine bagli degil. Admin, sizi Kisiler ekranindan aktiflestirebilir.
              </p>
            ) : (
              <div className="net-summary-content">
                <p className={`net-summary-net ${myNet >= 0 ? "positive" : "negative"}`}>
                  <strong>{meAsPerson.name}</strong> net bakiye
                </p>
                <p className={`net-summary-net-amount ${myNet >= 0 ? "positive" : "negative"}`}>
                  {myNet >= 0 ? "+" : "-"}
                  {formatTRY(Math.abs(myNet))}
                </p>
                {!!myReceivables.length && (
                  <div className="net-summary-chip positive">
                    <strong>Alacaklisiniz:</strong>{" "}
                    {myReceivables.map((item) => `${item.from_name} (${formatTRY(item.amount)})`).join(", ")}
                  </div>
                )}
                {!!myDebts.length && (
                  <div className="net-summary-chip negative">
                    <strong>Borclusunuz:</strong>{" "}
                    {myDebts.map((item) => `${item.to_name} (${formatTRY(item.amount)})`).join(", ")}
                  </div>
                )}
                {!myReceivables.length && !myDebts.length && (
                  <p className="muted net-summary-muted">
                    Uzerinizde acik borc/alacak yok.
                  </p>
                )}
              </div>
            )}
          </div>
          <Link href="/defter" className="button secondary net-summary-cta">
            Balances / Hesaplasma
          </Link>
        </div>
      </div>
      <CalendarClient
        purchases={normalizedPurchases}
        people={(people ?? []).map((person) => ({
          id: person.id,
          name: person.name,
        is_active: person.is_active
      }))}
        isAdmin={membership.role === "admin"}
        teamId={membership.team_id}
        currentUserId={user.id}
      />
    </div>
  );
}
