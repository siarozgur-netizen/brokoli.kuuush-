"use client";

import { FormEvent, useState } from "react";

type Invite = {
  id: string;
  code: string;
  used_count: number;
  max_uses: number | null;
  expires_at: string | null;
};

export function TeamClient({ invites }: { invites: Invite[] }) {
  const [maxUses, setMaxUses] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNewCode(null);

    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_uses: maxUses ? Number(maxUses) : null,
        expires_in_days: expiresDays ? Number(expiresDays) : null
      })
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Davet kodu olusturulamadi.");
      return;
    }

    setNewCode(data.code);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Davet Kodu Uret</h2>
        <form className="grid two" onSubmit={createInvite}>
          <input
            className="input"
            type="number"
            placeholder="Maksimum kullanim (opsiyonel)"
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Gecerlilik gunu (opsiyonel)"
            value={expiresDays}
            onChange={(event) => setExpiresDays(event.target.value)}
          />
          <button className="button" type="submit">
            Kod Uret
          </button>
        </form>
        {newCode && <p className="success">Yeni kod: {newCode}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Mevcut Kodlar</h2>
        <div className="desktop-only">
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Kullanim</th>
                <th>Bitis</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td><strong>{invite.code}</strong></td>
                  <td>
                    {invite.used_count}
                    {invite.max_uses ? ` / ${invite.max_uses}` : " / limitsiz"}
                  </td>
                  <td>{invite.expires_at ? new Date(invite.expires_at).toLocaleString("tr-TR") : "Yok"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-only grid">
          {invites.map((invite) => (
            <div key={invite.id} className="mobile-card">
              <p><strong>Kod:</strong> {invite.code}</p>
              <p>
                <strong>Kullanim:</strong> {invite.used_count}
                {invite.max_uses ? ` / ${invite.max_uses}` : " / limitsiz"}
              </p>
              <p><strong>Bitis:</strong> {invite.expires_at ? new Date(invite.expires_at).toLocaleString("tr-TR") : "Yok"}</p>
            </div>
          ))}
          {!invites.length && <p className="muted">Davet kodu yok.</p>}
        </div>
      </div>
    </div>
  );
}
