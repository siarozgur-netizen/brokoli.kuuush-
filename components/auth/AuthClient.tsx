"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "password" | "magic" | "signup";

export function AuthClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();

    if (mode === "magic") {
      const { error: submitError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (submitError) setError(submitError.message);
      else setMessage("Magic link gonderildi. E-postayi kontrol edin.");
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      const { error: submitError } = await supabase.auth.signUp({ email, password });
      if (submitError) setError(submitError.message);
      else setMessage("Kayit olusturuldu. Giris yapabilir veya e-postanizi dogrulayabilirsiniz.");
      setLoading(false);
      return;
    }

    const { error: submitError } = await supabase.auth.signInWithPassword({ email, password });

    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
      <h1 style={{ marginTop: 0 }}>Giris</h1>
      <p className="muted">E-posta ile giris yapin. Ilk giristen sonra takim olusturabilir veya davet kodu ile katilabilirsiniz.</p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`button ${mode === "password" ? "" : "secondary"}`} onClick={() => setMode("password")}>E-posta + Sifre</button>
        <button className={`button ${mode === "magic" ? "" : "secondary"}`} onClick={() => setMode("magic")}>Magic Link</button>
        <button className={`button ${mode === "signup" ? "" : "secondary"}`} onClick={() => setMode("signup")}>Kayit Ol</button>
      </div>

      <form onSubmit={onSubmit} className="grid">
        <input
          className="input"
          placeholder="E-posta"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
        />
        {mode !== "magic" && (
          <input
            className="input"
            placeholder="Sifre"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={6}
            required
          />
        )}
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Bekleyin..." : mode === "magic" ? "Magic Link Gonder" : mode === "signup" ? "Kayit Ol" : "Giris Yap"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </div>
  );
}
