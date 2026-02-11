import { redirect } from "next/navigation";
import { JoinOrCreateClient } from "@/components/team/JoinOrCreateClient";
import { requireAuth, getMembership } from "@/lib/team";

export default async function JoinPage() {
  const user = await requireAuth();
  const membership = await getMembership(user.id);

  if (membership) redirect("/");

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Takim Secimi</h1>
      <JoinOrCreateClient />
    </div>
  );
}
