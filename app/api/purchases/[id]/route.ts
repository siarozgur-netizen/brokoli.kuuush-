import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiMembership } from "@/lib/api-auth";
import { normalizePurchasePayload } from "@/lib/validators";

function mapPurchaseRow(purchase: {
  id: string;
  date: string;
  total_amount: number | string;
  purchase_type: string | null;
  purchase_splits:
    | {
        person_id: string;
        percentage: number | string;
        amount: number | string;
        people: { name: string } | { name: string }[] | null;
      }[]
    | null;
}) {
  return {
    id: purchase.id,
    date: purchase.date,
    total_amount: Number(purchase.total_amount),
    purchase_type: purchase.purchase_type === "munchies" ? "munchies" : "satin_alim",
    splits: (purchase.purchase_splits ?? []).map((split) => {
      const relation = split.people;
      const personName = Array.isArray(relation) ? relation[0]?.name ?? "Bilinmiyor" : relation?.name ?? "Bilinmiyor";
      return {
        person_id: split.person_id,
        person_name: personName,
        percentage: Number(split.percentage),
        amount: Number(split.amount)
      };
    })
  };
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Duzenleme sadece admin icin acik." }, { status: 403 });
  }

  const body = await request.json();
  const normalized = normalizePurchasePayload(body);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const personIds = normalized.splits.map((split) => split.person_id);
  const { data: people, error: peopleError } = await session.supabase
    .from("people")
    .select("id")
    .eq("team_id", session.membership.team_id)
    .in("id", personIds);

  if (peopleError || (people ?? []).length !== personIds.length) {
    return NextResponse.json({ error: "Katilimcilar gecersiz." }, { status: 400 });
  }

  const { data: purchase } = await session.supabase
    .from("purchases")
    .select("id")
    .eq("id", context.params.id)
    .eq("team_id", session.membership.team_id)
    .maybeSingle();

  if (!purchase) {
    return NextResponse.json({ error: "Kayit bulunamadi." }, { status: 404 });
  }

  const { error: updateError } = await session.supabase
    .from("purchases")
    .update({
      date: normalized.date,
      total_amount: normalized.total_amount,
      purchase_type: normalized.purchase_type
    })
    .eq("id", context.params.id)
    .eq("team_id", session.membership.team_id);

  if (updateError) {
    if (updateError.message?.includes("purchase_type")) {
      return NextResponse.json(
        { error: "Veritabani guncellemesi eksik. Lutfen purchase_type migration dosyasini calistirin." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await session.supabase.from("purchase_splits").delete().eq("purchase_id", context.params.id);

  const payload = normalized.splits.map((split) => ({
    purchase_id: context.params.id,
    person_id: split.person_id,
    percentage: split.percentage,
    amount: split.amount
  }));

  const { error: splitError } = await session.supabase.from("purchase_splits").insert(payload);
  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 400 });

  const { data: purchaseView, error: purchaseViewError } = await session.supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_type, purchase_splits(person_id, percentage, amount, people(name))")
    .eq("team_id", session.membership.team_id)
    .eq("id", context.params.id)
    .single();

  if (purchaseViewError || !purchaseView) {
    revalidatePath("/");
    revalidatePath("/defter");
    revalidatePath("/report");
    return NextResponse.json({ ok: true });
  }

  revalidatePath("/");
  revalidatePath("/defter");
  revalidatePath("/report");
  return NextResponse.json({ ok: true, purchase: mapPurchaseRow(purchaseView) });
}

export async function DELETE(_: Request, context: { params: { id: string } }) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Silme sadece admin icin acik." }, { status: 403 });
  }

  const { error } = await session.supabase
    .from("purchases")
    .delete()
    .eq("id", context.params.id)
    .eq("team_id", session.membership.team_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/");
  revalidatePath("/defter");
  revalidatePath("/report");
  return NextResponse.json({ ok: true });
}
