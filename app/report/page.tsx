import { formatTRY } from "@/lib/currency";
import { computeBalances } from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/team";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function ReportPage({
  searchParams
}: {
  searchParams: { month?: string };
}) {
  const { membership } = await requireMembership();
  const month = searchParams.month ?? getCurrentMonth();
  const { start, end } = getMonthBounds(month);
  const supabase = await createClient();

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, total_amount, purchase_splits(person_id, amount, people(name))")
    .eq("team_id", membership.team_id)
    .gte("date", start)
    .lt("date", end);

  const monthlyTotal = (purchases ?? []).reduce((sum, item) => sum + Number(item.total_amount), 0);
  const balances = computeBalances(
    (purchases ?? []).map((purchase) => ({
      id: purchase.id,
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
    }))
  );
  const paidTotal = balances.reduce((sum, row) => sum + row.paid, 0);
  const participantCount = balances.length;
  const chartRows = balances
    .map((row) => ({
      name: row.person_name,
      value: row.paid
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const chartMax = chartRows.length ? Math.max(...chartRows.map((item) => item.value), 1) : 1;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Aylik Rapor</h1>
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
        <h2>Toplam Harcama</h2>
        <p style={{ fontSize: 28, margin: 0 }}>{formatTRY(monthlyTotal)}</p>
      </div>

      <div className="card">
        <h2>Hizli Ozet</h2>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Toplam Odenen:</strong> {formatTRY(paidTotal)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Katilimci Sayisi:</strong> {participantCount}
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
              <text x="20" y="215" fontSize="10" fill="#64748b">
                TL
              </text>
            </svg>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Grafigi gostermek icin bu ay kayit olmali.</p>
        )}
      </div>

      <div className="card">
        <h2>Detayli Dagilim</h2>
        <p className="muted" style={{ margin: 0 }}>
          Kisi bazli net borc/alacak dagilimi ve odeme kapatma islemleri icin
          <strong> Balances / Hesaplasma</strong> ekranini kullanin.
        </p>
      </div>
    </div>
  );
}
