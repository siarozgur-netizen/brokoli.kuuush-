import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin duzenleyebilir." }, { status: 403 });
  }

  const body = await request.json();
  const payload: Record<string, unknown> = {};

  if (typeof body?.name === "string") payload.name = body.name.trim();
  if (typeof body?.is_active === "boolean") payload.is_active = body.is_active;

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: "Guncellenecek alan yok." }, { status: 400 });
  }

  const { error } = await session.supabase
    .from("people")
    .update(payload)
    .eq("id", context.params.id)
    .eq("team_id", session.membership.team_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: { id: string } }) {
  try {
    const session = await requireApiMembership();
    if ("error" in session) return session.error;

    if (session.membership.role !== "admin") {
      return NextResponse.json({ error: "Sadece admin silebilir." }, { status: 403 });
    }

    const personId = context.params.id;
    const teamId = session.membership.team_id;
    const admin = createAdminClient();

    const { data: person, error: personError } = await admin
      .from("people")
      .select("id")
      .eq("id", personId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (personError || !person) {
      return NextResponse.json({ error: "Kisi bulunamadi." }, { status: 404 });
    }

    const { data: teamPurchases, error: teamPurchasesError } = await admin
      .from("purchases")
      .select("id")
      .eq("team_id", teamId);

    if (teamPurchasesError) {
      return NextResponse.json({ error: teamPurchasesError.message }, { status: 400 });
    }

    const teamPurchaseIds = (teamPurchases ?? []).map((row) => row.id);
    const { data: affectedSplitRows, error: affectedSplitError } = teamPurchaseIds.length
      ? await admin
          .from("purchase_splits")
          .select("purchase_id")
          .eq("person_id", personId)
          .in("purchase_id", teamPurchaseIds)
      : { data: [], error: null };

    if (affectedSplitError) {
      return NextResponse.json({ error: affectedSplitError.message }, { status: 400 });
    }

    const affectedPurchaseIds = [...new Set((affectedSplitRows ?? []).map((row) => row.purchase_id))];

    const { error: settlementDeleteError } = await admin
      .from("settlement_payments")
      .delete()
      .eq("team_id", teamId)
      .or(`from_person_id.eq.${personId},to_person_id.eq.${personId}`);

    if (settlementDeleteError) {
      return NextResponse.json({ error: settlementDeleteError.message }, { status: 400 });
    }

    if (affectedPurchaseIds.length) {
      const { error: splitDeleteError } = await admin
        .from("purchase_splits")
        .delete()
        .eq("person_id", personId)
        .in("purchase_id", affectedPurchaseIds);

      if (splitDeleteError) {
        return NextResponse.json({ error: splitDeleteError.message }, { status: 400 });
      }

      const { data: remainingSplits, error: remainingSplitsError } = await admin
        .from("purchase_splits")
        .select("id, purchase_id, amount")
        .in("purchase_id", affectedPurchaseIds);

      if (remainingSplitsError) {
        return NextResponse.json({ error: remainingSplitsError.message }, { status: 400 });
      }

      const splitsByPurchase = new Map<string, Array<{ id: string; amount: number }>>();
      for (const split of remainingSplits ?? []) {
        const bucket = splitsByPurchase.get(split.purchase_id) ?? [];
        bucket.push({ id: split.id, amount: Number(split.amount) });
        splitsByPurchase.set(split.purchase_id, bucket);
      }

      const purchasesToDelete: string[] = [];
      const purchasesToUpdate: Array<{ id: string; total: number }> = [];

      for (const purchaseId of affectedPurchaseIds) {
        const splits = splitsByPurchase.get(purchaseId) ?? [];
        if (!splits.length) {
          purchasesToDelete.push(purchaseId);
          continue;
        }

        const nextTotal = Number(splits.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
        purchasesToUpdate.push({ id: purchaseId, total: nextTotal });
      }

      for (const purchase of purchasesToUpdate) {
        const { error: updatePurchaseError } = await admin
          .from("purchases")
          .update({ total_amount: purchase.total })
          .eq("id", purchase.id)
          .eq("team_id", teamId);

        if (updatePurchaseError) {
          return NextResponse.json({ error: updatePurchaseError.message }, { status: 400 });
        }
      }

      if (purchasesToDelete.length) {
        const { error: deletePurchaseError } = await admin
          .from("purchases")
          .delete()
          .eq("team_id", teamId)
          .in("id", purchasesToDelete);

        if (deletePurchaseError) {
          return NextResponse.json({ error: deletePurchaseError.message }, { status: 400 });
        }
      }

      for (const purchaseId of affectedPurchaseIds) {
        const splits = splitsByPurchase.get(purchaseId) ?? [];
        if (!splits.length) continue;

        const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
        if (splitTotal <= 0) continue;

        for (const split of splits) {
          const percentage = Number(((split.amount / splitTotal) * 100).toFixed(2));
          const { error: updateSplitError } = await admin
            .from("purchase_splits")
            .update({ percentage })
            .eq("id", split.id);

          if (updateSplitError) {
            return NextResponse.json({ error: updateSplitError.message }, { status: 400 });
          }
        }
      }
    }

    const { error: deletePersonError } = await admin
      .from("people")
      .delete()
      .eq("id", personId)
      .eq("team_id", teamId);

    if (deletePersonError) return NextResponse.json({ error: deletePersonError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Silme islemi sirasinda beklenmeyen hata olustu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
