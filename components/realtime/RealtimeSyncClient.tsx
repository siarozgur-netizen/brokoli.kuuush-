"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function RealtimeSyncClient({ teamId }: { teamId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefreshAt = 0;

    const scheduleRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 500) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        lastRefreshAt = Date.now();
        router.refresh();
      }, 220);
    };

    const channel = supabase
      .channel(`app-sync-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchases", filter: `team_id=eq.${teamId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "people", filter: `team_id=eq.${teamId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_invites", filter: `team_id=eq.${teamId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members", filter: `team_id=eq.${teamId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlement_payments", filter: `team_id=eq.${teamId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, teamId]);

  return null;
}
