import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { getMembership } from "@/lib/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayName } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const session = await requireApiUser();
    if ("error" in session) return session.error;

    const membership = await getMembership(session.user.id);
    if (membership) {
      return NextResponse.json({ error: "Zaten bir takima uyelisiniz." }, { status: 400 });
    }

    const body = await request.json();
    const code = String(body?.code ?? "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "Davet kodu zorunlu." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: invite, error: inviteError } = await admin
      .from("team_invites")
      .select("id, team_id, expires_at, max_uses, used_count")
      .ilike("code", code)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json(
        { error: `Davet kodu sorgu hatasi: ${inviteError.message}` },
        { status: 400 }
      );
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Davet kodu bulunamadi. Kodun dogru oldugunu kontrol edin veya yeni kod isteyin." },
        { status: 400 }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Davet kodunun suresi dolmus." }, { status: 400 });
    }

    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
      return NextResponse.json({ error: "Davet kodu kullanim limiti dolmus." }, { status: 400 });
    }

    const { error: insertError } = await admin.from("team_members").insert({
      team_id: invite.team_id,
      user_id: session.user.id,
      role: "member"
    });

    if (insertError) {
      if (insertError.message?.toLowerCase().includes("duplicate")) {
        return NextResponse.json({ error: "Bu takima zaten katilmissiniz." }, { status: 400 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await admin
      .from("team_invites")
      .update({ used_count: invite.used_count + 1 })
      .eq("id", invite.id);

    const displayName = getDisplayName(session.user);
    const { error: peopleError } = await admin.from("people").upsert(
      {
        team_id: invite.team_id,
        linked_user_id: session.user.id,
        name: displayName,
        is_active: true
      },
      { onConflict: "team_id,linked_user_id", ignoreDuplicates: false }
    );

    if (peopleError) {
      return NextResponse.json({
        ok: true,
        warning: `Takima katilim oldu ama kisi senkronu basarisiz: ${peopleError.message}`
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen sunucu hatasi.";
    return NextResponse.json({ error: `Join API hatasi: ${message}` }, { status: 500 });
  }
}
