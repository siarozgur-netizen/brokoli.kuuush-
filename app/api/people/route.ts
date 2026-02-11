import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";

export async function POST(request: Request) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin kisi ekleyebilir." }, { status: 403 });
  }

  const body = await request.json();
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Isim zorunlu." }, { status: 400 });
  }

  const { error } = await session.supabase.from("people").insert({
    name,
    team_id: session.membership.team_id,
    is_active: true
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
