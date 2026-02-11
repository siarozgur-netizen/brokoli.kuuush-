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

export async function GET() {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  const { data, error } = await session.supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_type, purchase_splits(person_id, percentage, amount, people(name))")
    .eq("team_id", session.membership.team_id)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    purchases: (data ?? []).map((item) => mapPurchaseRow(item))
  });
}

export async function POST(request: Request) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

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

  const { data: purchase, error: purchaseError } = await session.supabase
    .from("purchases")
    .insert({
      team_id: session.membership.team_id,
      date: normalized.date,
      total_amount: normalized.total_amount,
      purchase_type: normalized.purchase_type,
      created_by: session.user.id
    })
    .select("id")
    .single();

  if (purchaseError || !purchase) {
    if (purchaseError?.message?.includes("purchase_type")) {
      return NextResponse.json(
        { error: "Veritabani guncellemesi eksik. Lutfen purchase_type migration dosyasini calistirin." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: purchaseError?.message ?? "Satin alim kaydi olusturulamadi." }, { status: 400 });
  }

  const payload = normalized.splits.map((split) => ({
    purchase_id: purchase.id,
    person_id: split.person_id,
    percentage: split.percentage,
    amount: split.amount
  }));

  const { error: splitsError } = await session.supabase.from("purchase_splits").insert(payload);

  if (splitsError) {
    await session.supabase.from("purchases").delete().eq("id", purchase.id);
    return NextResponse.json({ error: splitsError.message }, { status: 400 });
  }

  const { data: purchaseView, error: purchaseViewError } = await session.supabase
    .from("purchases")
    .select("id, date, total_amount, purchase_type, purchase_splits(person_id, percentage, amount, people(name))")
    .eq("team_id", session.membership.team_id)
    .eq("id", purchase.id)
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
