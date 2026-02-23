import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/team";

export default async function JoinPage() {
  await requireAuth();
  redirect("/teams");
}
