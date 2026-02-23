"use client";

import { FormEvent, useMemo, useState } from "react";

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
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const getInviteLink = (code: string) => (baseUrl ? `${baseUrl}/teams?invite=${encodeURIComponent(code)}` : "");

  const copyToClipboard = async (value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedText(value);
    setTimeout(() => setCopiedText((current) => (current === value ? null : current)), 1800);
  };

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
        {newCode && (
          <div className="grid" style={{ marginTop: 10, gap: 8 }}>
            <p className="success" style={{ margin: 0 }}>Yeni kod: {newCode}</p>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <input className="input" readOnly value={getInviteLink(newCode)} />
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => copyToClipboard(getInviteLink(newCode))}
              >
                Linki Kopyala
              </button>
            </div>
          </div>
        )}
        {copiedText && <p className="success" style={{ marginTop: 8 }}>Link kopyalandi.</p>}
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
                <th>Link</th>
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
                  <td>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ width: "auto" }}
                      onClick={() => copyToClipboard(getInviteLink(invite.code))}
                    >
                      Linki Kopyala
                    </button>
                  </td>
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
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => copyToClipboard(getInviteLink(invite.code))}
              >
                Linki Kopyala
              </button>
            </div>
          ))}
          {!invites.length && <p className="muted">Davet kodu yok.</p>}
        </div>
      </div>
    </div>
  );
}
