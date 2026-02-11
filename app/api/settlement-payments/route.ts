import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";
import { normalizeSettlementPaymentPayload } from "@/lib/validators";

async function getCurrentPersonId(session: Awaited<ReturnType<typeof requireApiMembership>>) {
  if ("error" in session) return null;

  const { data: person } = await session.supabase
    .from("people")
    .select("id")
    .eq("team_id", session.membership.team_id)
    .eq("linked_user_id", session.user.id)
    .maybeSingle();

  return person?.id ?? null;
}

export async function POST(request: Request) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  const body = await request.json();
  const normalized = normalizeSettlementPaymentPayload(body);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data: people, error: peopleError } = await session.supabase
    .from("people")
    .select("id")
    .eq("team_id", session.membership.team_id)
    .in("id", [normalized.from_person_id, normalized.to_person_id]);

  if (peopleError || (people ?? []).length !== 2) {
    return NextResponse.json({ error: "Kisiler takim icinde bulunamadi." }, { status: 400 });
  }

  const currentPersonId = await getCurrentPersonId(session);
  if (!currentPersonId) {
    return NextResponse.json({ error: "Bu islem icin kullanici bir kisi kaydi ile eslesmeli." }, { status: 403 });
  }

  if (currentPersonId !== normalized.from_person_id && currentPersonId !== normalized.to_person_id) {
    return NextResponse.json({ error: "Bu odemeyi sadece borclu veya alacakli kisi isleyebilir." }, { status: 403 });
  }

  const directConfirm = currentPersonId === normalized.to_person_id;
  const { error } = await session.supabase.from("settlement_payments").insert({
    team_id: session.membership.team_id,
    from_person_id: normalized.from_person_id,
    to_person_id: normalized.to_person_id,
    amount: normalized.amount,
    paid_at: normalized.paid_at,
    note: normalized.note,
    created_by: session.user.id,
    status: directConfirm ? "confirmed" : "pending",
    requested_by_person_id: currentPersonId,
    confirmed_by_person_id: directConfirm ? currentPersonId : null,
    confirmed_at: directConfirm ? new Date().toISOString() : null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  const body = (await request.json()) as { payment_id?: string; action?: "confirm" | "reject" };
  const paymentId = String(body.payment_id ?? "").trim();
  const action = body.action;

  if (!paymentId || (action !== "confirm" && action !== "reject")) {
    return NextResponse.json({ error: "Gecersiz onay istegi." }, { status: 400 });
  }

  const currentPersonId = await getCurrentPersonId(session);
  if (!currentPersonId) {
    return NextResponse.json({ error: "Bu islem icin kullanici bir kisi kaydi ile eslesmeli." }, { status: 403 });
  }

  const { data: payment, error: paymentError } = await session.supabase
    .from("settlement_payments")
    .select("id, from_person_id, to_person_id, status")
    .eq("id", paymentId)
    .eq("team_id", session.membership.team_id)
    .maybeSingle();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Odeme kaydi bulunamadi." }, { status: 404 });
  }

  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Bu odeme zaten sonuclanmis." }, { status: 400 });
  }

  if (currentPersonId !== payment.to_person_id) {
    return NextResponse.json({ error: "Onay islemini sadece alacakli kisi yapabilir." }, { status: 403 });
  }

  const nextStatus = action === "confirm" ? "confirmed" : "rejected";
  const { error: updateError } = await session.supabase
    .from("settlement_payments")
    .update({
      status: nextStatus,
      confirmed_by_person_id: currentPersonId,
      confirmed_at: new Date().toISOString()
    })
    .eq("id", payment.id)
    .eq("team_id", session.membership.team_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
