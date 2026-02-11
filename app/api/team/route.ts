import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { getMembership } from "@/lib/team";
import { getDisplayName } from "@/lib/user-display";

export async function POST(request: Request) {
  const session = await requireApiUser();
  if ("error" in session) return session.error;

  const membership = await getMembership(session.user.id);
  if (membership) {
    return NextResponse.json({ error: "Zaten bir takima uyelik var." }, { status: 400 });
  }

  const body = await request.json();
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Takim adi zorunlu." }, { status: 400 });
  }

  const { data: team, error: teamError } = await session.supabase
    .from("teams")
    .insert({ name, owner_id: session.user.id })
    .select("id")
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: teamError?.message ?? "Takim olusturulamadi." }, { status: 400 });
  }

  const { error: memberError } = await session.supabase.from("team_members").insert({
    team_id: team.id,
    user_id: session.user.id,
    role: "admin"
  });

  if (memberError) {
    await session.supabase.from("teams").delete().eq("id", team.id);
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const displayName = getDisplayName(session.user);
  const { error: peopleError } = await session.supabase.from("people").upsert(
    {
      team_id: team.id,
      linked_user_id: session.user.id,
      name: displayName,
      is_active: true
    },
    { onConflict: "team_id,linked_user_id", ignoreDuplicates: false }
  );

  if (peopleError) {
    return NextResponse.json({
      ok: true,
      warning: `Takim olustu ama kisi senkronu basarisiz: ${peopleError.message}`
    });
  }

  return NextResponse.json({ ok: true });
}
