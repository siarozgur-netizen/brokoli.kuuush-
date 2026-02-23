import { TeamsClient } from "@/components/teams/TeamsClient";
import { createClient } from "@/lib/supabase/server";
import { getMembership, getMemberships, requireAuth } from "@/lib/team";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamsPage() {
  const user = await requireAuth();
  const memberships = await getMemberships(user.id);
  const activeMembership = await getMembership(user.id);
  const supabase = await createClient();

  const withCounts = await Promise.all(
    memberships.map(async (membership) => {
      const { count } = await supabase
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", membership.team_id);

      return {
        team_id: membership.team_id,
        team_name: membership.team_name,
        role: membership.role,
        member_count: count ?? 0,
        is_active: activeMembership?.team_id === membership.team_id
      } as const;
    })
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Takimlarim</h1>
      <TeamsClient teams={withCounts} />
    </div>
  );
}
