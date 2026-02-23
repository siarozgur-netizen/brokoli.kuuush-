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

  const { data: currentMembership } = await admin
    .from("team_members")
    .select("team_id, role")
    .eq("team_id", teamId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!currentMembership) {
    return NextResponse.json({ error: "Bu takima uyeliginiz yok." }, { status: 400 });
  }

  if (currentMembership.role === "admin") {
    const { data: otherMembers } = await admin
      .from("team_members")
      .select("user_id, created_at")
      .eq("team_id", teamId)
      .neq("user_id", session.user.id)
      .order("created_at", { ascending: true });

    const nextAdmin = otherMembers?.[0];
    if (!nextAdmin) {
      return NextResponse.json(
        { error: "Takimda baska uye yok. Once bir uye ekleyin veya takimi silin." },
        { status: 400 }
      );
    }

    const { error: promoteError } = await admin
      .from("team_members")
      .update({ role: "admin" })
      .eq("team_id", teamId)
      .eq("user_id", nextAdmin.user_id);

    if (promoteError) {
      return NextResponse.json({ error: promoteError.message }, { status: 400 });
    }
  }

  const { error: leaveError } = await admin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", session.user.id);

  if (leaveError) {
    return NextResponse.json({ error: leaveError.message }, { status: 400 });
  }

  const { data: remainingMemberships } = await admin
    .from("team_members")
    .select("team_id, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: true });

  const nextTeamId = remainingMemberships?.[0]?.team_id ?? null;
  await setActiveTeamForUser(session.user.id, nextTeamId);

  return NextResponse.json({ ok: true });
}
