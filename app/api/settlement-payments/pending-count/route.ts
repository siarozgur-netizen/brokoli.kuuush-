import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";

export async function GET() {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  const { data: person } = await session.supabase
    .from("people")
    .select("id")
    .eq("team_id", session.membership.team_id)
    .eq("linked_user_id", session.user.id)
    .maybeSingle();

  if (!person?.id) {
    return NextResponse.json({ pending_count: 0 });
  }

  const { count, error } = await session.supabase
    .from("settlement_payments")
    .select("id", { count: "exact", head: true })
    .eq("team_id", session.membership.team_id)
    .eq("to_person_id", person.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ pending_count: count ?? 0 });
}
