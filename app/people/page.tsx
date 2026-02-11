import { PeopleClient } from "@/components/people/PeopleClient";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/team";

export default async function PeoplePage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, name, is_active")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: true });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Kisiler</h1>
      <PeopleClient initialPeople={(people ?? []) as { id: string; name: string; is_active: boolean }[]} />
    </div>
  );
}
