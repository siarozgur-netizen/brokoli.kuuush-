"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventContentArg } from "@fullcalendar/core";
import type { EventClickArg } from "@fullcalendar/core";
import { formatTRY } from "@/lib/currency";
import { computeDirectTransfersFromPurchases, netPairTransfers } from "@/lib/settlement";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SplitView = {
  person_id: string;
  percentage: number;
  amount: number;
  person_name: string;
};

type PurchaseView = {
  id: string;
  date: string;
  total_amount: number;
  purchase_type: "satin_alim" | "munchies";
  created_by: string;
  splits: SplitView[];
};

type PersonView = {
  id: string;
  name: string;
  is_active: boolean;
};

export function CalendarClient({
  purchases,
  people,
  isAdmin,
  teamId,
  currentUserId
}: {
  purchases: PurchaseView[];
  people: PersonView[];
  isAdmin: boolean;
  teamId: string;
  currentUserId: string;
}) {
  const [purchaseState, setPurchaseState] = useState<PurchaseView[]>(purchases);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<"satin_alim" | "munchies" | null>(null);
  const [editing, setEditing] = useState<PurchaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reloadSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  const reloadPurchases = async () => {
    const seq = ++reloadSeqRef.current;
    const response = await fetch(`/api/purchases?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { purchases?: PurchaseView[] };
    if (response.ok && Array.isArray(data.purchases) && seq >= appliedSeqRef.current) {
      appliedSeqRef.current = seq;
      setPurchaseState(
        data.purchases.filter((item) => !deletedIdsRef.current.has(item.id))
      );
    }
  };

  const reloadPurchasesWithRetry = async () => {
    await reloadPurchases();
    setTimeout(() => {
      void reloadPurchases();
    }, 220);
    setTimeout(() => {
      void reloadPurchases();
    }, 700);
  };

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`purchases-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchases", filter: `team_id=eq.${teamId}` },
        async () => {
          await reloadPurchases();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_splits" },
        async () => {
          await reloadPurchases();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId]);

  const events = useMemo(() => {
    const daySummary = purchaseState.reduce<
      Record<string, { satinAlimCount: number; munchiesCount: number; hasSatinAlim: boolean; hasMunchies: boolean }>
    >((acc, purchase) => {
      const current = acc[purchase.date] ?? {
        satinAlimCount: 0,
        munchiesCount: 0,
        hasSatinAlim: false,
        hasMunchies: false
      };

      if (purchase.purchase_type === "munchies") {
        current.munchiesCount += 1;
        current.hasMunchies = true;
      } else {
        current.satinAlimCount += 1;
        current.hasSatinAlim = true;
      }

      acc[purchase.date] = current;
      return acc;
    }, {});

    return Object.entries(daySummary).map(([date, summary]) => ({
      id: date,
      title: "",
      start: date,
      allDay: true,
      classNames: ["broccoli-event"],
      extendedProps: {
        satinAlimCount: summary.satinAlimCount,
        munchiesCount: summary.munchiesCount,
        hasSatinAlim: summary.hasSatinAlim,
        hasMunchies: summary.hasMunchies
      }
    }));
  }, [purchaseState]);

  const dailyPurchases = useMemo(() => {
    if (!selectedDate) return [];
    return purchaseState.filter((purchase) => purchase.date === selectedDate);
  }, [purchaseState, selectedDate]);

  const onDateClick = (arg: DateClickArg) => {
    setSelectedDate(arg.dateStr);
    setAddingType(null);
    setEditing(null);
    setError(null);
  };

  const onEventClick = (arg: EventClickArg) => {
    const dateValue = arg.event.startStr.slice(0, 10);
    setSelectedDate(dateValue);
    setAddingType(null);
    setEditing(null);
    setError(null);
  };

  return (
    <>
      <div className="card app-calendar-card">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          buttonText={{ today: "Bugun" }}
          dayCellClassNames={() => ["app-day-cell"]}
          events={events}
          eventContent={renderBroccoliEvent}
          dateClick={onDateClick}
          eventClick={onEventClick}
        />
      </div>

      {selectedDate && (
        <DayModal
          selectedDate={selectedDate}
          purchases={dailyPurchases}
          people={people}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          addingType={addingType}
          editing={editing}
          error={error}
          onClose={() => {
            setSelectedDate(null);
            setAddingType(null);
            setEditing(null);
            setError(null);
          }}
          onAdd={(type) => {
            setAddingType(type);
            setEditing(null);
          }}
          onCancelForm={() => {
            setAddingType(null);
            setEditing(null);
          }}
          onEdit={(purchase) => {
            setAddingType(null);
            setEditing(purchase);
          }}
          onError={setError}
          onPurchaseSaved={(purchase) => {
            void (async () => {
              if (purchase) {
                setPurchaseState((current) => {
                  const filtered = current.filter((item) => item.id !== purchase.id);
                  return [purchase, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
                });
              }
              await reloadPurchasesWithRetry();
              setAddingType(null);
              setEditing(null);
              setError(null);
            })();
          }}
          onPurchaseDeleted={(purchaseId) => {
            void (async () => {
              deletedIdsRef.current.add(purchaseId);
              setTimeout(() => {
                deletedIdsRef.current.delete(purchaseId);
              }, 60000);
              setPurchaseState((current) => current.filter((item) => item.id !== purchaseId));
              await reloadPurchasesWithRetry();
              setEditing((current) => (current?.id === purchaseId ? null : current));
              setError(null);
            })();
          }}
        />
      )}

    </>
  );
}

function renderBroccoliEvent(arg: EventContentArg) {
  const hasSatinAlim = Boolean(arg.event.extendedProps.hasSatinAlim);
  const hasMunchies = Boolean(arg.event.extendedProps.hasMunchies);
  const satinAlimCount = Number(arg.event.extendedProps.satinAlimCount ?? 0);
  const munchiesCount = Number(arg.event.extendedProps.munchiesCount ?? 0);
  return (
    <div
      className="broccoli-event-content"
      title={`Satin Alim: ${satinAlimCount}, Munchies: ${munchiesCount}`}
    >
      {hasSatinAlim && <img src="/broccoli.svg" alt="Satin Alim" className="broccoli-event-icon" />}
      {hasMunchies && <img src="/hamburger.svg" alt="Munchies" className="broccoli-event-icon" />}
    </div>
  );
}

function DayModal({
  selectedDate,
  purchases,
  people,
  isAdmin,
  currentUserId,
  addingType,
  editing,
  error,
  onClose,
  onAdd,
  onCancelForm,
  onEdit,
  onError,
  onPurchaseSaved,
  onPurchaseDeleted
}: {
  selectedDate: string;
  purchases: PurchaseView[];
  people: PersonView[];
  isAdmin: boolean;
  currentUserId: string;
  addingType: "satin_alim" | "munchies" | null;
  editing: PurchaseView | null;
  error: string | null;
  onClose: () => void;
  onAdd: (type: "satin_alim" | "munchies") => void;
  onCancelForm: () => void;
  onEdit: (purchase: PurchaseView) => void;
  onError: (value: string | null) => void;
  onPurchaseSaved: (purchase?: PurchaseView) => void;
  onPurchaseDeleted: (purchaseId: string) => void;
}) {
  const activePeople = people.filter((person) => person.is_active);
  const dailySatinAlim = purchases.filter((purchase) => purchase.purchase_type !== "munchies");
  const dailyMunchies = purchases.filter((purchase) => purchase.purchase_type === "munchies");
  const dailyTransfers = useMemo(() => {
    return netPairTransfers(
      computeDirectTransfersFromPurchases(
        purchases.map((purchase) => ({
          id: purchase.id,
          total_amount: purchase.total_amount,
          splits: purchase.splits.map((split) => ({
            person_id: split.person_id,
            person_name: split.person_name,
            amount: split.amount
          }))
        }))
      )
    );
  }, [purchases]);

  const deletePurchase = async (id: string) => {
    if (!window.confirm("Bu satin alim kaydi silinsin mi?")) return;

    const response = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      onError(data.error ?? "Silme hatasi");
      return;
    }

    onPurchaseDeleted(id);
  };

  return (
    <div
      className="day-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.42)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        zIndex: 50
      }}
    >
      <div className="card day-modal-card" style={{ width: "min(860px, 100%)", maxHeight: "92vh", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{selectedDate} Gunluk Kayitlar</h2>
          <button className="button secondary" style={{ width: "auto" }} onClick={onClose}>
            Kapat
          </button>
        </div>

        <div className="grid" style={{ marginTop: 12, gap: 18 }}>
          <section>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Satin Alimlar</h3>
              <button className="button" style={{ width: "auto" }} onClick={() => onAdd("satin_alim")}>
                Satin Alim Ekle
              </button>
            </div>
            <PurchaseList
              purchases={dailySatinAlim}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={deletePurchase}
            />
          </section>

          <section>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Munchies</h3>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => onAdd("munchies")}>
                Munchies Ekle
              </button>
            </div>
            <PurchaseList
              purchases={dailyMunchies}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={deletePurchase}
            />
          </section>
        </div>

        <div className="card" style={{ marginTop: 14, borderColor: "#bbf7d0", background: "#f0fdf4" }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Gunluk Denklesme</h3>
          {dailyTransfers.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {dailyTransfers.map((item, index) => (
                <li key={`${item.from_id}-${item.to_id}-${index}`}>
                  <strong>{item.from_name}</strong>, <strong>{item.to_name}</strong> kişisine {formatTRY(item.amount)} atmali.
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Bu gun icin borc/alacak farki yok.</p>
          )}
        </div>

        {(addingType || editing) && (
          <PurchaseForm
            people={activePeople}
            date={selectedDate}
            initial={editing}
            purchaseType={editing?.purchase_type ?? addingType ?? "satin_alim"}
            canEdit={isAdmin}
            onError={onError}
            onSaved={onPurchaseSaved}
            onCancel={() => {
              onCancelForm();
              onError(null);
            }}
          />
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}


function PurchaseList({
  purchases,
  isAdmin,
  currentUserId,
  onEdit,
  onDelete
}: {
  purchases: PurchaseView[];
  isAdmin: boolean;
  currentUserId: string;
  onEdit: (purchase: PurchaseView) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  if (!purchases.length) return <p className="muted">Bu bolumde kayit yok.</p>;

  return (
    <div className="grid">
      {purchases.map((purchase) => (
        <div key={purchase.id} className="card" style={{ borderColor: "#d1fae5", background: "#f0fdf4" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{formatTRY(purchase.total_amount)}</strong>
            <div className="row" style={{ width: "auto" }}>
              {isAdmin && (
                <button className="button secondary" style={{ width: "auto" }} onClick={() => onEdit(purchase)}>
                  Duzenle
                </button>
              )}
              {(isAdmin || purchase.created_by === currentUserId) && (
                <button className="button danger" style={{ width: "auto" }} onClick={() => onDelete(purchase.id)}>
                  Sil
                </button>
              )}
            </div>
          </div>
          <ul>
            {purchase.splits.map((split) => (
              <li key={`${purchase.id}-${split.person_id}`}>
                {split.person_name}: %{split.percentage} ({formatTRY(split.amount)})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PurchaseForm({
  people,
  date,
  initial,
  purchaseType,
  canEdit,
  onError,
  onSaved,
  onCancel
}: {
  people: PersonView[];
  date: string;
  initial: PurchaseView | null;
  purchaseType: "satin_alim" | "munchies";
  canEdit: boolean;
  onError: (value: string | null) => void;
  onSaved: (purchase?: PurchaseView) => void;
  onCancel: () => void;
}) {
  const parseInputNumber = (raw: string) => Number(raw.replace(",", "."));
  const [formDate, setFormDate] = useState(initial?.date ?? date);
  const [total, setTotal] = useState(initial ? String(initial.total_amount) : "");
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, number>>(() => {
    const source = initial?.splits ?? [];
    return source.reduce<Record<string, number>>((acc, split) => {
      acc[split.person_id] = split.amount;
      return acc;
    }, {});
  });
  const [saving, setSaving] = useState(false);

  const totalAmount = Number(total || 0);
  const totalAllocated = Object.values(selectedAmounts).reduce((sum, item) => sum + Number(item || 0), 0);
  const remaining = Number((totalAmount - totalAllocated).toFixed(2));

  const togglePerson = (personId: string, enabled: boolean) => {
    setSelectedAmounts((current) => {
      const next = { ...current };
      if (!enabled) delete next[personId];
      else next[personId] = next[personId] ?? 0;
      return next;
    });
  };

  const applyEqualSplit = () => {
    onError(null);
    const personIds = Object.keys(selectedAmounts);
    const count = personIds.length;

    if (!count) {
      onError("Once en az bir katilimci secin.");
      return;
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      onError("Esit bolmek icin once gecerli bir toplam tutar girin.");
      return;
    }

    const totalCents = Math.round(totalAmount * 100);
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - base * count;

    const next: Record<string, number> = {};
    personIds.forEach((personId, index) => {
      const cents = index === count - 1 ? base + remainder : base;
      next[personId] = Number((cents / 100).toFixed(2));
    });
    setSelectedAmounts(next);
  };

  const submit = async () => {
    onError(null);
    const personIds = Object.keys(selectedAmounts);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      onError("Toplam tutar 0'dan buyuk olmalidir.");
      return;
    }

    if (!personIds.length) {
      onError("En az bir katilimci secin.");
      return;
    }

    const hasInvalidAmount = personIds.some((personId) => {
      const value = Number(selectedAmounts[personId]);
      return !Number.isFinite(value) || value < 0;
    });
    if (hasInvalidAmount) {
      onError("Gecersiz tutar girdiniz. Lutfen TL degerlerini kontrol edin.");
      return;
    }

    if (Math.abs(remaining) > 0.01) {
      onError("Toplam tutar ile dagitilan tutar esit olmali.");
      return;
    }

    setSaving(true);

    const splits = Object.entries(selectedAmounts).map(([person_id, amount]) => ({
      person_id,
      amount: Number(amount)
    }));

    const response = await fetch(initial ? `/api/purchases/${initial.id}` : "/api/purchases", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: formDate, total_amount: Number(total), purchase_type: purchaseType, splits })
    });

    const data = await response.json();

    if (!response.ok) {
      onError(data.error ?? "Kayit hatasi");
      setSaving(false);
      return;
    }

    onSaved(data.purchase as PurchaseView | undefined);
  };

  if (initial && !canEdit) {
    return null;
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>
        {initial
          ? purchaseType === "munchies"
            ? "Munchies Duzenle"
            : "Satin Alim Duzenle"
          : purchaseType === "munchies"
            ? "Munchies Ekle"
            : "Satin Alim Ekle"}
      </h3>
      <div className="grid two">
        <label>
          Tarih
          <input className="input" type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
        </label>
        <label className="purchase-total-card">
          <span className="purchase-total-label">Toplam Tutar</span>
          <div className="purchase-total-input-wrap">
            <span className="purchase-total-prefix">TRY</span>
            <input
              className="input purchase-total-input"
              type="number"
              step="0.01"
              value={total}
              onChange={(event) => setTotal(event.target.value.replace(",", "."))}
              placeholder="0.00"
            />
          </div>
          <span className="purchase-total-preview">{formatTRY(totalAmount || 0)}</span>
        </label>
      </div>

      <div className="grid" style={{ marginTop: 10 }}>
        {people.map((person) => {
          const enabled = person.id in selectedAmounts;
          return (
            <div
              key={person.id}
              className={`row participant-row${enabled ? " active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => togglePerson(person.id, !enabled)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  togglePerson(person.id, !enabled);
                }
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => togglePerson(person.id, event.target.checked)}
                onClick={(event) => event.stopPropagation()}
              />
              <span className="participant-name">{person.name}</span>
              <div className="participant-amount-wrap">
                <span className="participant-amount-prefix">TRY</span>
                <input
                  className="input participant-amount-input"
                  type="number"
                  step="0.01"
                  disabled={!enabled}
                  value={enabled ? selectedAmounts[person.id] : ""}
                  onChange={(event) =>
                    setSelectedAmounts((current) => ({ ...current, [person.id]: parseInputNumber(event.target.value) }))
                  }
                  onClick={(event) => event.stopPropagation()}
                  placeholder="0.00"
                />
              </div>
              <span className="participant-amount-preview">{enabled ? formatTRY(Number(selectedAmounts[person.id] || 0)) : "-"}</span>
            </div>
          );
        })}
      </div>

      <p className={Math.abs(remaining) <= 0.01 ? "success" : "error"}>
        Dagitilan: {formatTRY(totalAllocated)} / {formatTRY(totalAmount || 0)} (Kalan: {formatTRY(remaining)})
      </p>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={applyEqualSplit}>
          Esit Bol
        </button>
        <button type="button" className="button" style={{ width: "auto" }} disabled={saving} onClick={submit}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onCancel}>
          Vazgec
        </button>
      </div>
    </div>
  );
}
