import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMembership, type Membership } from "@/lib/team";

type ApiUserSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
};

type ApiMembershipSession = ApiUserSession & {
  membership: Membership;
};

type ApiError = {
  error: NextResponse;
};

export async function requireApiUser(): Promise<ApiUserSession | ApiError> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { supabase, user };
}

export async function requireApiMembership(): Promise<ApiMembershipSession | ApiError> {
  const session = await requireApiUser();
  if ("error" in session) return session;

  const membership = await getMembership(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: "Team membership required" }, { status: 403 }) };
  }

  return { ...session, membership };
}
