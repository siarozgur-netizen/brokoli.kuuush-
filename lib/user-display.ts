import type { User } from "@supabase/supabase-js";

function fromEmail(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDisplayName(user: User) {
  const meta = user.user_metadata as Record<string, unknown> | null;
  const preferred =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    fromEmail(user.email) ||
    "Katilimci";

  return preferred.slice(0, 80);
}
