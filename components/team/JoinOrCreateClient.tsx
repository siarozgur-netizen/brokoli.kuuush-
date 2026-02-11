"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function JoinOrCreateClient() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const safeJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading("create");
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName })
      });
      const data = (await safeJson(response)) as { error?: string; warning?: string };

      if (!response.ok) {
        const message = data.error ?? "Takim olusturulamadi.";
        setError(message);
        setToast({ type: "error", message });
        setLoading(null);
        return;
      }

      if (data.warning) {
        setError(data.warning);
        setToast({ type: "error", message: data.warning });
      } else {
        const message = "Takim olusturuldu. Ana sayfaya yonlendiriliyorsunuz...";
        setSuccess(message);
        setToast({ type: "success", message });
      }
      router.replace("/");
      router.refresh();
      setTimeout(() => {
        if (window.location.pathname === "/join") window.location.assign("/");
      }, 1200);
    } catch {
      const message = "Baglanti hatasi. Lutfen tekrar deneyin.";
      setError(message);
      setToast({ type: "error", message });
      setLoading(null);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading("join");
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = (await safeJson(response)) as { error?: string; warning?: string };

      if (!response.ok) {
        const message = data.error ?? "Katilma islemi basarisiz.";
        setError(message);
        setToast({ type: "error", message });
        setLoading(null);
        return;
      }

      if (data.warning) {
        setError(data.warning);
        setToast({ type: "error", message: data.warning });
      } else {
        const message = "Takima katildiniz. Ana sayfaya yonlendiriliyorsunuz...";
        setSuccess(message);
        setToast({ type: "success", message });
      }
      router.replace("/");
      router.refresh();
      setTimeout(() => {
        if (window.location.pathname === "/join") window.location.assign("/");
      }, 1200);
    } catch {
      const message = "Baglanti hatasi. Lutfen tekrar deneyin.";
      setError(message);
      setToast({ type: "error", message });
      setLoading(null);
    }
  };

  return (
    <div className="grid two">
      <div className="card">
        <h2>Yeni Takim Olustur</h2>
        <p className="muted">Ilk uyeniz olarak admin (owner) olursunuz.</p>
        <form className="grid" onSubmit={onCreate}>
          <input
            className="input"
            placeholder="Takim adi"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            required
          />
          <button disabled={loading === "create"} className="button" type="submit">
            {loading === "create" ? "Olusturuluyor..." : "Takim Olustur"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Davet Kodu ile Katil</h2>
        <p className="muted">Admin tarafindan paylasilan kodu girin.</p>
        <form className="grid" onSubmit={onJoin}>
          <input
            className="input"
            placeholder="Davet kodu"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            required
          />
          <button disabled={loading === "join"} className="button" type="submit">
            {loading === "join" ? "Katiliniyor..." : "Takima Katil"}
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {toast && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 120,
            maxWidth: 360,
            padding: "10px 12px",
            borderRadius: 10,
            border: toast.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
            background: toast.type === "success" ? "#ecfdf5" : "#fef2f2",
            color: toast.type === "success" ? "#166534" : "#991b1b",
            boxShadow: "0 6px 22px rgba(15,23,42,0.12)"
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>{toast.type === "success" ? "Basarili" : "Hata"}</strong>
            <button
              type="button"
              className="button secondary"
              style={{ width: "auto", padding: "2px 8px", fontSize: 12 }}
              onClick={() => setToast(null)}
            >
              Kapat
            </button>
          </div>
          <p style={{ margin: "6px 0 0 0", fontSize: 13 }}>{toast.message}</p>
        </div>
      )}
    </div>
  );
}
