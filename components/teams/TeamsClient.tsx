"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JoinOrCreateClient } from "@/components/team/JoinOrCreateClient";

type TeamItem = {
  team_id: string;
  team_name: string;
  role: "admin" | "member";
  member_count: number;
  is_active: boolean;
};

export function TeamsClient({ teams }: { teams: TeamItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [inviteCodeFromLink, setInviteCodeFromLink] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite") ?? params.get("code") ?? "";
    setInviteCodeFromLink(invite.trim().toUpperCase());
  }, []);

  const callApi = async (
    key: string,
    url: string,
    init: RequestInit,
    successRefresh = true
  ) => {
    setLoadingKey(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Islem basarisiz.");
        return;
      }

      if (successRefresh) {
        router.refresh();
      }
    } catch {
      setError("Baglanti hatasi. Lutfen tekrar deneyin.");
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Takimlarim</h2>
        {teams.length ? (
          <div className="grid">
            {teams.map((team) => {
              const switchKey = `switch-${team.team_id}`;
              const leaveKey = `leave-${team.team_id}`;
              const deleteKey = `delete-${team.team_id}`;
              return (
                <div key={team.team_id} className="row" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div className="grid" style={{ gap: 4 }}>
                    <strong>{team.team_name}</strong>
                    <div className="row" style={{ width: "auto", gap: 8 }}>
                      <span className="badge">{team.role === "admin" ? "Admin" : "Uye"}</span>
                      <span className="muted" style={{ fontSize: 13 }}>{team.member_count} uye</span>
                      {team.is_active && <span className="badge">Aktif Takim</span>}
                    </div>
                  </div>
                  <div className="row" style={{ width: "auto", flexWrap: "wrap" }}>
                    {!team.is_active && (
                      <button
                        type="button"
                        className="button secondary"
                        style={{ width: "auto" }}
                        disabled={loadingKey === switchKey}
                        onClick={() =>
                          callApi(
                            switchKey,
                            "/api/teams/switch",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ team_id: team.team_id })
                            }
                          )
                        }
                      >
                        {loadingKey === switchKey ? "Geciliyor..." : "Bu Takima Gec"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="button secondary"
                      style={{ width: "auto" }}
                      disabled={loadingKey === leaveKey}
                      onClick={() => {
                        if (!window.confirm("Bu takimdan ayrilmak istiyor musunuz?")) return;
                        void callApi(
                          leaveKey,
                          "/api/teams/leave",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ team_id: team.team_id })
                          }
                        );
                      }}
                    >
                      {loadingKey === leaveKey ? "Ayriliniyor..." : "Ayril"}
                    </button>

                    {team.role === "admin" && (
                      <button
                        type="button"
                        className="button danger"
                        style={{ width: "auto" }}
                        disabled={loadingKey === deleteKey}
                        onClick={() => {
                          if (!window.confirm("Takimi silmek istiyor musunuz? Bu islem geri alinamaz.")) return;
                          void callApi(deleteKey, `/api/teams/${team.team_id}`, { method: "DELETE" });
                        }}
                      >
                        {loadingKey === deleteKey ? "Siliniyor..." : "Takimi Sil"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Henuz bir takima uye degilsiniz.</p>
        )}
        {error && <p className="error" style={{ marginBottom: 0 }}>{error}</p>}
      </div>

      <JoinOrCreateClient redirectTo="/teams" initialCode={inviteCodeFromLink} />
    </div>
  );
}
