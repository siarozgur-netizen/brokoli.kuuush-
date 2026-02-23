import { redirect } from "next/navigation";
import { AuthClient } from "@/components/auth/AuthClient";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/team";

export default async function AuthPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const membership = await getMembership(user.id);
    redirect(membership ? "/" : "/teams");
  }

  return <AuthClient />;
}
