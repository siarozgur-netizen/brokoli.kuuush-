"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: "Segoe UI, sans-serif", background: "#f8fafc" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(640px, 100%)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Uygulama hatasi</h2>
            <p style={{ color: "#6b7280" }}>{error.message || "Beklenmeyen bir hata olustu."}</p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                background: "#111827",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
