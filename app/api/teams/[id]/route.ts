import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveTeamForUser } from "@/lib/team";

export async function DELETE(_: Request, context: { params: { id: string } }) {
  const session = await requireApiUser();
  if ("error" in session) return session.error;

  const teamId = context.params.id;
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Bu takima uyeliginiz yok." }, { status: 403 });
  }

  if (membership.role !== "admin") {
    return NextResponse.json({ error: "Takimi sadece admin silebilir." }, { status: 403 });
  }

  const { error: deleteError } = await admin.from("teams").delete().eq("id", teamId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
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
