import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveTeamForUser } from "@/lib/team";

export async function POST(request: Request) {
  const session = await requireApiUser();
  if ("error" in session) return session.error;

  const body = (await request.json()) as { team_id?: string };
  const teamId = String(body.team_id ?? "").trim();
  if (!teamId) {
    return NextResponse.json({ error: "Takim secimi zorunlu." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Bu takima uyeliginiz yok." }, { status: 403 });
  }

  await setActiveTeamForUser(session.user.id, teamId);
  return NextResponse.json({ ok: true });
}
