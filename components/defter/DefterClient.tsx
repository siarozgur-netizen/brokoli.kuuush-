"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTRY } from "@/lib/currency";
import type { PersonBalance, SettlementTransfer } from "@/lib/settlement";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/browser";

type PaymentLog = {
  id: string;
  from_person_id: string;
  to_person_id: string;
  from_name: string;
  to_name: string;
  amount: number;
  paid_at: string;
  note: string | null;
  status: "pending" | "confirmed" | "rejected";
  requested_by_person_id: string | null;
  requested_by_name: string | null;
  confirmed_by_person_id: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
};

type Props = {
  month: string;
  allSpend: number;
  allCount: number;
  periodSpend: number;
  periodCount: number;
  allTransfers: SettlementTransfer[];
  periodTransfers: SettlementTransfer[];
  allBalances: PersonBalance[];
  periodBalances: PersonBalance[];
  paymentLogs: PaymentLog[];
  mePersonId: string | null;
  mePersonName: string | null;
  teamId: string;
};

const formatTRYRounded = (value: number) => formatTRY(Math.round(value));
const MIN_VISIBLE_TRANSFER = 20;

function applyPaymentToTransfers(
  transfers: SettlementTransfer[],
  payment: { from_person_id: string; to_person_id: string; amount: number }
) {
  return transfers
    .map((item) => {
      if (item.from_id === payment.from_person_id && item.to_id === payment.to_person_id) {
        return { ...item, amount: Number((item.amount - payment.amount).toFixed(2)) };
      }
      return item;
    })
    .filter((item) => item.amount >= MIN_VISIBLE_TRANSFER);
}

export function DefterClient(props: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<{
    from_person_id: string;
    from_name: string;
    to_person_id: string;
    to_name: string;
    amount: number;
    canDirectConfirm: boolean;
  } | null>(null);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actingPaymentId, setActingPaymentId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>(props.paymentLogs);
  const [allTransfers, setAllTransfers] = useState<SettlementTransfer[]>(props.allTransfers);
  const [periodTransfers, setPeriodTransfers] = useState<SettlementTransfer[]>(props.periodTransfers);

  useEffect(() => {
    setPaymentLogs(props.paymentLogs);
    setAllTransfers(props.allTransfers);
    setPeriodTransfers(props.periodTransfers);
  }, [props.paymentLogs, props.allTransfers, props.periodTransfers]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 180);
    };

    const channel = supabase
      .channel(`defter-sync-${props.teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlement_payments", filter: `team_id=eq.${props.teamId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchases", filter: `team_id=eq.${props.teamId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [props.teamId, router]);

  const pendingLogs = paymentLogs.filter((item) => item.status === "pending");
  const pendingByPair = new Set(pendingLogs.map((item) => `${item.from_person_id}::${item.to_person_id}`));

  const openPay = (transfer: SettlementTransfer) => {
    const canDirectConfirm = props.mePersonId === transfer.to_id;
    setDraft({
      from_person_id: transfer.from_id,
      from_name: transfer.from_name,
      to_person_id: transfer.to_id,
      to_name: transfer.to_name,
      amount: transfer.amount,
      canDirectConfirm
    });
    setAmount(String(transfer.amount));
    setPaidAt(new Date().toISOString().slice(0, 10));
    setNote("");
    setError(null);
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    setSaving(true);
    setError(null);

    const response = await fetch("/api/settlement-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_person_id: draft.from_person_id,
        to_person_id: draft.to_person_id,
        amount: Number(amount),
        paid_at: paidAt,
        note
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Odeme kaydedilemedi.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setDraft(null);
    setAmount("");
    setNote("");
    setError(null);

    const isDirect = draft.canDirectConfirm;
    const nowIso = new Date().toISOString();
    const optimistic: PaymentLog = {
      id: `temp-${Math.random().toString(36).slice(2)}`,
      from_person_id: draft.from_person_id,
      to_person_id: draft.to_person_id,
      from_name: draft.from_name,
      to_name: draft.to_name,
      amount: Number(amount),
      paid_at: paidAt,
      note: note || null,
      status: isDirect ? "confirmed" : "pending",
      requested_by_person_id: props.mePersonId,
      requested_by_name: props.mePersonName,
      confirmed_by_person_id: isDirect ? props.mePersonId : null,
      confirmed_by_name: isDirect ? props.mePersonName : null,
      confirmed_at: isDirect ? nowIso : null
    };
    setPaymentLogs((current) => [optimistic, ...current]);

    if (isDirect) {
      const payment = {
        from_person_id: draft.from_person_id,
        to_person_id: draft.to_person_id,
        amount: Number(amount)
      };
      setAllTransfers((current) => applyPaymentToTransfers(current, payment));
      setPeriodTransfers((current) => applyPaymentToTransfers(current, payment));
    }
  };

  const resolvePending = async (paymentId: string, action: "confirm" | "reject") => {
    setActingPaymentId(paymentId);
    setError(null);
    const response = await fetch("/api/settlement-payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: paymentId, action })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Onay islemi kaydedilemedi.");
      setActingPaymentId(null);
      return;
    }
    setActingPaymentId(null);

    const target = paymentLogs.find((item) => item.id === paymentId);
    if (!target) return;

    const nowIso = new Date().toISOString();
    setPaymentLogs((current) =>
      current.map((item) =>
        item.id !== paymentId
          ? item
          : {
              ...item,
              status: action === "confirm" ? "confirmed" : "rejected",
              confirmed_by_person_id: props.mePersonId,
              confirmed_by_name: props.mePersonName,
              confirmed_at: nowIso
            }
      )
    );

    if (action === "confirm") {
      const payment = {
        from_person_id: target.from_person_id,
        to_person_id: target.to_person_id,
        amount: target.amount
      };
      setAllTransfers((current) => applyPaymentToTransfers(current, payment));
      setPeriodTransfers((current) => applyPaymentToTransfers(current, payment));
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <a href="#financial-activity" className="button secondary" style={{ width: "auto" }}>
          Hareketler ({paymentLogs.length})
        </a>
      </div>
      {info && (
        <div className="card" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p style={{ margin: 0 }}>{info}</p>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setInfo(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      <div className="grid two">
        <div className="card" style={{ borderColor: "#bbf7d0", background: "#f0fdf4" }}>
          <h3 style={{ marginTop: 0 }}>Genel</h3>
          <p style={{ margin: 0 }}><strong>Toplam Harcama:</strong> {formatTRY(props.allSpend)}</p>
          <p style={{ margin: "6px 0 0 0" }}><strong>Kayit:</strong> {props.allCount}</p>
        </div>
        <div className="card" style={{ borderColor: "#bfdbfe", background: "#eff6ff" }}>
          <h3 style={{ marginTop: 0 }}>Bu Ay</h3>
          <p style={{ margin: 0 }}><strong>Toplam Harcama:</strong> {formatTRY(props.periodSpend)}</p>
          <p style={{ margin: "6px 0 0 0" }}><strong>Kayit:</strong> {props.periodCount}</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Genel Net</h2>
          {!props.mePersonId && (
            <p className="muted" style={{ marginTop: 0 }}>
              Odeme/onay islemleri icin hesabinizin kisi kaydi ile baglanmasi gerekir.
            </p>
          )}
          {allTransfers.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {allTransfers.map((item, index) => (
                <li key={`${item.from_id}-${item.to_id}-${index}`} style={{ marginBottom: 8 }}>
                  <div className="row defter-transfer-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="defter-transfer-text">
                      <strong>{item.from_name}</strong> {"->"} <strong>{item.to_name}</strong>: {formatTRYRounded(item.amount)}
                    </span>
                    {(() => {
                      const pairKey = `${item.from_id}::${item.to_id}`;
                      const hasPending = pendingByPair.has(pairKey);
                      if (props.mePersonId === item.from_id) {
                        return (
                          <button
                            className="button secondary"
                            style={{ width: "auto" }}
                            onClick={() => {
                              if (hasPending) {
                                setInfo("Bu odeme icin alacakli onayi bekleniyor.");
                                return;
                              }
                              openPay(item);
                            }}
                          >
                            {hasPending ? "Onay Bekleniyor" : "Odendi Olarak Isaretle"}
                          </button>
                        );
                      }
                      if (props.mePersonId === item.to_id) {
                        return (
                          <button className="button" style={{ width: "auto" }} onClick={() => openPay(item)}>
                            Tek Adimda Kapat
                          </button>
                        );
                      }
                      return (
                        <span className="muted" style={{ fontSize: 12 }}>
                          Islem sadece borclu/alacakli kisilere acik
                        </span>
                      );
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Tum zamanlarda borc/alacak farki yok.</p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Aylik Net</h2>
          {periodTransfers.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {periodTransfers.map((item, index) => (
                <li key={`${item.from_id}-${item.to_id}-${index}`}>
                  <strong>{item.from_name}</strong> {"->"} <strong>{item.to_name}</strong>: {formatTRYRounded(item.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Bu donemde borc/alacak farki yok.</p>
          )}
        </div>
      </div>

      <div id="pending-approvals" className="card" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
        <h2 style={{ marginTop: 0 }}>Bekleyen Onaylar</h2>
        {pendingLogs.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {pendingLogs.map((log) => {
              const canConfirm = props.mePersonId === log.to_person_id;
              const isDebtor = props.mePersonId === log.from_person_id;
              return (
                <li key={log.id} style={{ marginBottom: 10 }}>
                  <div className="grid" style={{ gap: 6 }}>
                    <div>
                      <strong>{log.from_name}</strong> {"->"} <strong>{log.to_name}</strong>:
                      {" "}{formatTRYRounded(log.amount)} ({log.paid_at})
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {canConfirm
                        ? "Alacakli olarak onay vermeniz bekleniyor."
                        : isDebtor
                          ? "Borclu olarak odeme bildiriminiz gonderildi, alacakli onayi bekleniyor."
                          : "Bilgi amacli kayit."}
                    </div>
                    {canConfirm && (
                      <div className="row" style={{ width: "auto", justifyContent: "flex-start" }}>
                        <button
                          type="button"
                          className="button"
                          style={{ width: "auto" }}
                          disabled={actingPaymentId === log.id}
                          onClick={() => resolvePending(log.id, "confirm")}
                        >
                          {actingPaymentId === log.id ? "Isleniyor..." : "Onayla"}
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ width: "auto" }}
                          disabled={actingPaymentId === log.id}
                          onClick={() => resolvePending(log.id, "reject")}
                        >
                          Reddet
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Bekleyen odeme onayi yok.</p>
        )}
      </div>

      <div id="financial-activity" className="card" style={{ borderColor: "#dbeafe", background: "#f8fafc" }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Hareketler
            <span className="muted"> ({paymentLogs.length} kayit)</span>
          </summary>
          <p className="muted" style={{ marginTop: 8, marginBottom: 10 }}>
            Odeme kapatma islemleri burada listelenir.
          </p>
          <div className="desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Gonderen</th>
                  <th>Alici</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th>Onay Bilgisi</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {paymentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.paid_at}</td>
                    <td>{log.from_name}</td>
                    <td>{log.to_name}</td>
                    <td>{formatTRYRounded(log.amount)}</td>
                    <td>
                      {log.status === "confirmed" ? "Onaylandi" : log.status === "pending" ? "Beklemede" : "Reddedildi"}
                    </td>
                    <td>
                      {log.status === "confirmed"
                        ? `${log.confirmed_by_name ?? "Bilinmiyor"} (${log.confirmed_at ? new Date(log.confirmed_at).toLocaleString("tr-TR") : "-"})`
                        : log.status === "pending"
                          ? `Talep: ${log.requested_by_name ?? "Bilinmiyor"}`
                          : `Islem: ${log.confirmed_by_name ?? "Bilinmiyor"}`}
                    </td>
                    <td>{log.note ?? "-"}</td>
                  </tr>
                ))}
                {!paymentLogs.length && (
                  <tr>
                    <td colSpan={7} className="muted">Odeme kaydi yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mobile-only grid">
            {paymentLogs.map((log) => (
              <div key={log.id} className="mobile-card">
                <p><strong>Tarih:</strong> {log.paid_at}</p>
                <p><strong>Gonderen:</strong> {log.from_name}</p>
                <p><strong>Alici:</strong> {log.to_name}</p>
                <p><strong>Tutar:</strong> {formatTRYRounded(log.amount)}</p>
                <p><strong>Durum:</strong> {log.status === "confirmed" ? "Onaylandi" : log.status === "pending" ? "Beklemede" : "Reddedildi"}</p>
                <p>
                  <strong>Onay Bilgisi:</strong>{" "}
                  {log.status === "confirmed"
                    ? `${log.confirmed_by_name ?? "Bilinmiyor"} (${log.confirmed_at ? new Date(log.confirmed_at).toLocaleString("tr-TR") : "-"})`
                    : log.status === "pending"
                      ? `Talep: ${log.requested_by_name ?? "Bilinmiyor"}`
                      : `Islem: ${log.confirmed_by_name ?? "Bilinmiyor"}`}
                </p>
                <p><strong>Not:</strong> {log.note ?? "-"}</p>
              </div>
            ))}
            {!paymentLogs.length && <p className="muted">Odeme kaydi yok.</p>}
          </div>
        </details>
      </div>

      <BalanceTable title="Genel Kisi Ozeti" rows={props.allBalances} />
      <BalanceTable title="Aylik Kisi Ozeti" rows={props.periodBalances} />

      {draft && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 16 }}>
          <form className="card grid" style={{ width: "min(520px, 100%)" }} onSubmit={submitPayment}>
            <h3 style={{ margin: 0 }}>Odeme Kaydi</h3>
            <p className="muted" style={{ margin: 0 }}>
              {draft.from_name} {"->"} {draft.to_name}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {draft.canDirectConfirm
                ? "Alacakli olarak bu kaydi tek adimda kapatabilirsiniz."
                : "Borclu bildirimi olusturulacak, alacakli onayi ile kesinlesecek."}
            </p>
            <div className="grid two">
              <label>
                Tutar
                <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              <label>
                Tarih
                <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
              </label>
            </div>
            <label>
              Not
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </label>
            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => setDraft(null)}>
                Iptal
              </button>
              <button type="submit" className="button" style={{ width: "auto" }} disabled={saving}>
                {saving ? "Kaydediliyor..." : draft.canDirectConfirm ? "Direkt Kapat" : "Odeme Bildir"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function BalanceTable({ title, rows }: { title: string; rows: PersonBalance[] }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="desktop-only">
        <table className="table">
          <thead>
            <tr>
              <th>Kisi</th>
              <th>Odedigi</th>
              <th>Payina Dusen</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.person_id}>
                <td>{row.person_name}</td>
                <td>{formatTRYRounded(row.paid)}</td>
                <td>{formatTRYRounded(row.owed)}</td>
                <td style={{ color: row.net >= 0 ? "#166534" : "#b91c1c" }}>
                  {row.net >= 0 ? "+" : "-"}
                  {formatTRYRounded(Math.abs(row.net))}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="muted">Kayit yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mobile-only grid">
        {rows.map((row) => (
          <div key={row.person_id} className="mobile-card">
            <p><strong>Kisi:</strong> {row.person_name}</p>
            <p><strong>Odedigi:</strong> {formatTRYRounded(row.paid)}</p>
            <p><strong>Payina Dusen:</strong> {formatTRYRounded(row.owed)}</p>
            <p style={{ color: row.net >= 0 ? "#166534" : "#b91c1c" }}>
              <strong>Net:</strong> {row.net >= 0 ? "+" : "-"}
              {formatTRYRounded(Math.abs(row.net))}
            </p>
          </div>
        ))}
        {!rows.length && <p className="muted">Kayit yok.</p>}
      </div>
    </div>
  );
}
