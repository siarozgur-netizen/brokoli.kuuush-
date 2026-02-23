import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayName } from "@/lib/user-display";

export type Membership = {
  team_id: string;
  role: "admin" | "member";
  team_name: string;
  created_at?: string;
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id, role, created_at, teams(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!data?.length) return [];

  return data.map((item) => {
    const teamRelation = item.teams as { name: string } | { name: string }[] | null;
    const teamName = Array.isArray(teamRelation) ? teamRelation[0]?.name : teamRelation?.name;
    return {
      team_id: item.team_id,
      role: item.role,
      team_name: teamName ?? "Takim",
      created_at: item.created_at
    };
  });
}

export async function setActiveTeamForUser(userId: string, teamId: string | null) {
  try {
    const admin = createAdminClient();
    if (!teamId) {
      await admin.from("user_active_teams").delete().eq("user_id", userId);
      return;
    }

    await admin.from("user_active_teams").upsert(
      {
        user_id: userId,
        team_id: teamId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Backward compatibility when migration is not applied yet.
  }
}

export async function getMembership(userId: string): Promise<Membership | null> {
  const memberships = await getMemberships(userId);
  if (!memberships.length) return null;

  let activeTeamId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: activeRow } = await supabase
      .from("user_active_teams")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle();
    activeTeamId = activeRow?.team_id ?? null;
  } catch {
    activeTeamId = null;
  }

  const activeMembership = memberships.find((item) => item.team_id === activeTeamId) ?? memberships[0];
  if (!activeTeamId || activeMembership.team_id !== activeTeamId) {
    await setActiveTeamForUser(userId, activeMembership.team_id);
  }

  return activeMembership;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return user;
}

export async function requireMembership() {
  const user = await requireAuth();
  const membership = await getMembership(user.id);

  if (!membership) redirect("/teams");

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
