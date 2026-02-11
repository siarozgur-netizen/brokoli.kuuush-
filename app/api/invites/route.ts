import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireApiMembership } from "@/lib/api-auth";

function makeCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request: Request) {
  const session = await requireApiMembership();
  if ("error" in session) return session.error;

  if (session.membership.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin davet kodu uretebilir." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const maxUses = body?.max_uses ? Number(body.max_uses) : null;
  const expiresInDays = body?.expires_in_days ? Number(body.expires_in_days) : null;

  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
    return NextResponse.json({ error: "max_uses pozitif tam sayi olmali." }, { status: 400 });
  }

  if (expiresInDays !== null && (!Number.isInteger(expiresInDays) || expiresInDays <= 0)) {
    return NextResponse.json({ error: "expires_in_days pozitif tam sayi olmali." }, { status: 400 });
  }

  const code = makeCode();
  const expiresAt =
    expiresInDays !== null ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const { error } = await session.supabase.from("team_invites").insert({
    team_id: session.membership.team_id,
    code,
    max_uses: maxUses,
    expires_at: expiresAt
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, code });
}
