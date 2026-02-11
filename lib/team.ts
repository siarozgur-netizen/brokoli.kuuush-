import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayName } from "@/lib/user-display";

export type Membership = {
  team_id: string;
  role: "admin" | "member";
  team_name: string;
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getMembership(userId: string): Promise<Membership | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id, role, teams(name)")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const teamRelation = data.teams as { name: string } | { name: string }[] | null;
  const teamName = Array.isArray(teamRelation) ? teamRelation[0]?.name : teamRelation?.name;

  return {
    team_id: data.team_id,
    role: data.role,
    team_name: teamName ?? "Takim"
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return user;
}

export async function requireMembership() {
  const user = await requireAuth();
  const membership = await getMembership(user.id);

  if (!membership) redirect("/join");

  await ensurePersonRow(user, membership.team_id);

  return { user, membership };
}

export async function requireAdmin() {
  const { user, membership } = await requireMembership();
  if (membership.role !== "admin") redirect("/");
  return { user, membership };
}

async function ensurePersonRow(user: User, teamId: string) {
  try {
    const admin = createAdminClient();
    await admin.from("people").upsert(
      {
        team_id: teamId,
        linked_user_id: user.id,
        name: getDisplayName(user),
        is_active: true
      },
      { onConflict: "team_id,linked_user_id", ignoreDuplicates: true }
    );
  } catch {
    // Best-effort sync; UI should still work even if this fails.
  }
}
