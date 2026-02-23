import { formatTRY } from "@/lib/currency";
import {
  applyPaymentsToBalances,
  computeBalances,
  normalizePaymentsForCurrentDebts,
  computeDirectTransfersFromPurchases,
  type PersonBalance
} from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/team";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentLog = {
  id: string;
  from_name: string;
  to_name: string;
  amount: number;
  paid_at: string;
  status: "pending" | "confirmed" | "rejected";
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  note: string | null;
};

function getMonthBounds(month: string) {
  const [year, monthPart] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthPart - 1, 1));
  const end = new Date(Date.UTC(year, monthPart, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const formatTRYRounded = (value: number) => formatTRY(Math.round(value));

function BalanceCards({ rows }: { rows: PersonBalance[] }) {
  if (!rows.length) return <p className="muted" style={{ margin: 0 }}>Kayit yok.</p>;
  return (
    <div className="grid">
      {rows.map((row) => (
        <div key={row.person_id} className="mobile-card defter-balance-card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{row.person_name}</p>
            <p
              style={{
                margin: 0,
                color: row.net >= 0 ? "#166534" : "#b91c1c",
                fontWeight: 800
              }}
            >
              {row.net >= 0 ? "+" : "-"}
              {formatTRYRounded(Math.abs(row.net))}
            </p>
          </div>
          <p><strong>Odedi:</strong> {formatTRYRounded(row.paid)}</p>
          <p><strong>Payi:</strong> {formatTRYRounded(row.owed)}</p>
        </div>
      ))}
    </div>
  );
}

export default async function ReportPage({
  searchParams
}: {
  searchParams: { month?: string };
}) {
  const { membership } = await requireMembership();
  const month = searchParams.month ?? getCurrentMonth();
  const { start, end } = getMonthBounds(month);
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, name")
    .eq("team_id", membership.team_id);
  const peopleMap = Object.fromEntries((people ?? []).map((person) => [person.id, person.name]));

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_splits(person_id, amount, people(name))")
    .eq("team_id", membership.team_id)
    .order("date", { ascending: false });

  const normalizedPurchases = (purchases ?? []).map((purchase) => ({
    id: purchase.id,
    date: purchase.date,
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
    .select("id, from_person_id, to_person_id, amount, paid_at, note, status, confirmed_by_person_id, confirmed_at")
    .eq("team_id", membership.team_id)
    .order("paid_at", { ascending: false });

  const paymentLogs: PaymentLog[] = (paymentRows ?? []).map((row) => ({
    id: row.id,
    from_name: peopleMap[row.from_person_id] ?? "Bilinmiyor",
    to_name: peopleMap[row.to_person_id] ?? "Bilinmiyor",
    amount: Number(row.amount),
    paid_at: row.paid_at,
    note: row.note,
    status: (row.status ?? "confirmed") as "pending" | "confirmed" | "rejected",
    confirmed_by_name: row.confirmed_by_person_id ? peopleMap[row.confirmed_by_person_id] ?? "Bilinmiyor" : null,
    confirmed_at: row.confirmed_at
  }));

  const allBaseBalances = computeBalances(normalizedPurchases);
  const allBaseTransfers = computeDirectTransfersFromPurchases(normalizedPurchases);
  const allConfirmedPayments = (paymentRows ?? [])
    .filter((item) => item.status === "confirmed" && item.confirmed_by_person_id)
    .map((item) => ({
      from_person_id: item.from_person_id,
      to_person_id: item.to_person_id,
      amount: Number(item.amount)
    }));
  const allNormalizedPayments = normalizePaymentsForCurrentDebts(allBaseTransfers, allConfirmedPayments);
  const allBalances = applyPaymentsToBalances(allBaseBalances, allNormalizedPayments, peopleMap);

  const monthPurchases = normalizedPurchases.filter((item) => item.date >= start && item.date < end);
  const monthBaseBalances = computeBalances(monthPurchases);
  const monthBaseTransfers = computeDirectTransfersFromPurchases(monthPurchases);
  const monthConfirmedPayments = (paymentRows ?? [])
    .filter(
      (item) =>
        item.status === "confirmed" &&
        item.confirmed_by_person_id &&
        item.paid_at >= start &&
        item.paid_at < end
    )
    .map((item) => ({
      from_person_id: item.from_person_id,
      to_person_id: item.to_person_id,
      amount: Number(item.amount)
    }));
  const monthNormalizedPayments = normalizePaymentsForCurrentDebts(monthBaseTransfers, monthConfirmedPayments);
  const periodBalances = applyPaymentsToBalances(monthBaseBalances, monthNormalizedPayments, peopleMap);

  const monthlyTotal = monthPurchases.reduce((sum, item) => sum + item.total_amount, 0);
  const paidTotal = periodBalances.reduce((sum, row) => sum + row.paid, 0);
  const participantCount = periodBalances.length;
  const chartRows = periodBalances
    .map((row) => ({ name: row.person_name, value: row.paid }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const chartMax = chartRows.length ? Math.max(...chartRows.map((item) => item.value), 1) : 1;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Rapor</h1>
      <form className="card" method="get">
        <label>
          Ay Secimi
          <input className="input" type="month" name="month" defaultValue={month} />
        </label>
        <button className="button" type="submit" style={{ marginTop: 10, width: "auto" }}>
          Goster
        </button>
      </form>

      <div className="card">
        <h2>Aylik Toplam</h2>
        <p style={{ fontSize: 30, margin: 0 }}>{formatTRY(monthlyTotal)}</p>
      </div>

      <div className="card">
        <h2>Hizli Ozet</h2>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Toplam Odenen:</strong> {formatTRY(paidTotal)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Katilimci:</strong> {participantCount}
        </p>
      </div>

      <div className="card">
        <h2>Kisi Basi Odeme Grafigi</h2>
        {chartRows.length ? (
          <div className="report-chart-wrap">
            <svg className="report-chart-svg" viewBox="0 0 680 280" role="img" aria-label="Kisi bazli odeme grafigi">
              <rect x="0" y="0" width="680" height="280" fill="#f8fafc" rx="12" />
              {chartRows.map((item, index) => {
                const barLeft = 60 + index * 75;
                const barHeight = Math.max(8, Math.round((item.value / chartMax) * 170));
                const barTop = 210 - barHeight;
                return (
                  <g key={item.name}>
                    <rect x={barLeft} y={barTop} width={42} height={barHeight} rx={8} fill="#22c55e" />
                    <text x={barLeft + 21} y={barTop - 8} textAnchor="middle" fontSize="10" fill="#166534">
                      {Math.round(item.value)}
                    </text>
                    <text x={barLeft + 21} y={236} textAnchor="middle" fontSize="10" fill="#334155">
                      {item.name.length > 10 ? `${item.name.slice(0, 10)}...` : item.name}
                    </text>
                  </g>
                );
              })}
              <line x1="40" y1="210" x2="640" y2="210" stroke="#cbd5e1" strokeWidth="1" />
              <text x="20" y="215" fontSize="10" fill="#64748b">TL</text>
            </svg>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Grafigi gostermek icin bu ay kayit olmali.</p>
        )}
      </div>

      <details className="card report-detail-card" open>
        <summary className="report-detail-summary">Hareketler ({paymentLogs.length})</summary>
        <div className="grid" style={{ marginTop: 10 }}>
          {paymentLogs.map((log) => (
            <div key={log.id} className="mobile-card defter-log-card">
              <p><strong>Tarih:</strong> {log.paid_at}</p>
              <p className="defter-flow">
                <span className="defter-person">{log.from_name}</span>
                <span className="defter-flow-arrow">→</span>
                <span className="defter-person">{log.to_name}</span>
              </p>
              <p><strong>Tutar:</strong> {formatTRYRounded(log.amount)}</p>
              <p><strong>Durum:</strong> {log.status === "confirmed" ? "Onaylandi" : log.status === "pending" ? "Beklemede" : "Reddedildi"}</p>
              <p>
                <strong>Onay Bilgisi:</strong>{" "}
                {log.status === "confirmed"
                  ? `${log.confirmed_by_name ?? "Bilinmiyor"} (${log.confirmed_at ? new Date(log.confirmed_at).toLocaleString("tr-TR") : "-"})`
                  : log.status === "pending"
                    ? "Onay bekleniyor"
                    : "Reddedildi"}
              </p>
              <p><strong>Not:</strong> {log.note ?? "-"}</p>
            </div>
          ))}
          {!paymentLogs.length && <p className="muted">Odeme kaydi yok.</p>}
        </div>
      </details>

      <details className="card report-detail-card">
        <summary className="report-detail-summary">Genel Kisi Ozeti</summary>
        <div style={{ marginTop: 10 }}>
          <BalanceCards rows={allBalances} />
        </div>
      </details>

      <details className="card report-detail-card">
        <summary className="report-detail-summary">Aylik Kisi Ozeti</summary>
        <div style={{ marginTop: 10 }}>
          <BalanceCards rows={periodBalances} />
        </div>
      </details>
    </div>
  );
}
