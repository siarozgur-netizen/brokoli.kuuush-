import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";

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
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin silebilir." }, { status: 403 });
  }

  const { error } = await session.supabase
    .from("people")
    .delete()
    .eq("id", context.params.id)
    .eq("team_id", session.membership.team_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
