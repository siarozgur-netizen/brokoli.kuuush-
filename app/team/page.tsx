import { TeamClient } from "@/components/team/TeamClient";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/team";
import { formatTRY } from "@/lib/currency";

type ActivityItem = {
  id: string;
  at: string;
  message: string;
};

export default async function TeamPage() {
  const { membership } = await requireMembership();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role, created_at")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: true });

  const { data: invites } = await supabase
    .from("team_invites")
    .select("id, code, used_count, max_uses, expires_at")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: false });

  const { data: people } = await supabase
    .from("people")
    .select("id, linked_user_id, name")
    .eq("team_id", membership.team_id);

  const peopleNameMap = Object.fromEntries(
    (people ?? [])
      .filter((person) => person.linked_user_id)
      .map((person) => [person.linked_user_id as string, person.name])
  );
  const personById = Object.fromEntries((people ?? []).map((person) => [person.id, person.name]));

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, created_at, created_by, purchase_type, total_amount, date")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: payments } = await supabase
    .from("settlement_payments")
    .select("id, created_at, created_by, from_person_id, to_person_id, amount, status, confirmed_at, confirmed_by_person_id")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: invitesForActivity } = await supabase
    .from("team_invites")
    .select("id, code, created_at")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const activity: ActivityItem[] = [];

  (members ?? []).forEach((member) => {
    activity.push({
      id: `member-${member.user_id}-${member.role}-${member.created_at}`,
      at: member.created_at,
      message: `${peopleNameMap[member.user_id] ?? "Bir kullanici"} takima ${member.role === "admin" ? "admin" : "uye"} olarak katildi.`
    });
  });

  (purchases ?? []).forEach((purchase) => {
    const actor = peopleNameMap[purchase.created_by] ?? "Bir kullanici";
    const typeLabel = purchase.purchase_type === "munchies" ? "Munchies" : "Satin alim";
    activity.push({
      id: `purchase-${purchase.id}`,
      at: purchase.created_at,
      message: `${actor}, ${purchase.date} tarihine ${typeLabel} kaydi ekledi (${formatTRY(Number(purchase.total_amount))}).`
    });
  });

  (payments ?? []).forEach((payment) => {
    const actor = peopleNameMap[payment.created_by] ?? "Bir kullanici";
    const fromName = personById[payment.from_person_id] ?? "Bilinmiyor";
    const toName = personById[payment.to_person_id] ?? "Bilinmiyor";

    activity.push({
      id: `payment-create-${payment.id}`,
      at: payment.created_at,
      message: `${actor}, ${fromName} -> ${toName} icin ${formatTRY(Number(payment.amount))} odeme kaydi olusturdu (${payment.status === "pending" ? "beklemede" : payment.status === "rejected" ? "reddedildi" : "onaylandi"}).`
    });

    if (payment.confirmed_at) {
      const confirmer = payment.confirmed_by_person_id
        ? personById[payment.confirmed_by_person_id] ?? "Bilinmiyor"
        : "Bilinmiyor";
      activity.push({
        id: `payment-confirm-${payment.id}`,
        at: payment.confirmed_at,
        message: `${confirmer}, ${fromName} -> ${toName} odemesini ${payment.status === "rejected" ? "reddetti" : "onayladi"}.`
      });
    }
  });

  (invitesForActivity ?? []).forEach((invite) => {
    activity.push({
      id: `invite-${invite.id}`,
      at: invite.created_at,
      message: `Yeni davet kodu olusturuldu: ${invite.code}.`
    });
  });

  const recentActivity = activity
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 40);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Takim Ayarlari</h1>
      <div className="card">
        <h2>Uyeler</h2>
        <ul className="team-member-list">
          {(members ?? []).map((member) => (
            <li key={member.user_id}>
              {peopleNameMap[member.user_id] ?? `Kullanici (${member.user_id.slice(0, 8)}...)`} - {member.role === "admin" ? "Admin" : "Uye"}
            </li>
          ))}
        </ul>
      </div>
      {membership.role === "admin" ? (
        <TeamClient invites={(invites ?? []) as { id: string; code: string; used_count: number; max_uses: number | null; expires_at: string | null }[]} />
      ) : (
        <p className="muted">Davet kodu yonetimi sadece admin kullanicisina aciktir.</p>
      )}

      <div className="card">
        <h2>Aktivite Gecmisi</h2>
        {recentActivity.length ? (
          <ul className="team-activity-list" style={{ margin: 0, paddingLeft: 18 }}>
            {recentActivity.map((item) => (
              <li key={item.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{new Date(item.at).toLocaleString("tr-TR")}</div>
                <div>{item.message}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Henuz aktivite kaydi yok.</p>
        )}
      </div>
    </div>
  );
}
