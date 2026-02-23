import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/team";
import { NavLinksClient } from "@/components/nav/NavLinksClient";
import { MobileTabBarClient } from "@/components/nav/MobileTabBarClient";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const membership = user ? await getMembership(user.id) : null;
  let pendingApprovalCount = 0;

  if (user && membership) {
    const { data: mePerson } = await supabase
      .from("people")
      .select("id")
      .eq("team_id", membership.team_id)
      .eq("linked_user_id", user.id)
      .maybeSingle();

    if (mePerson?.id) {
      const { count } = await supabase
        .from("settlement_payments")
        .select("id", { count: "exact", head: true })
        .eq("team_id", membership.team_id)
        .eq("to_person_id", mePerson.id)
        .eq("status", "pending");
      pendingApprovalCount = count ?? 0;
    }
  }

  return (
    <>
      <div className="nav">
        <div className="nav-inner">
          <div className="row" style={{ gap: 18 }}>
            <strong>brokoli.kuuush</strong>
            {membership && <span className="badge">{membership.team_name}</span>}
          </div>
          <div className="nav-links">
            <NavLinksClient
              isAuthenticated={Boolean(user)}
              isAdmin={membership?.role === "admin"}
              hasMembership={Boolean(membership)}
              pendingApprovals={pendingApprovalCount}
            />
            {user && (
              <form action="/api/auth/signout" method="post">
                <button type="submit" className="button secondary" style={{ width: "auto", padding: "8px 10px" }}>
                  Cikis
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <main className="container">{children}</main>
      {user && <MobileTabBarClient />}
    </>
  );
}
