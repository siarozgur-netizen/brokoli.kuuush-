"use client";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="card" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>Bir hata olustu</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {error.message || "Beklenmeyen bir hata olustu."}
        </p>
        <button className="button" style={{ width: "auto", marginTop: 12 }} onClick={() => reset()}>
          Tekrar dene
        </button>
      </div>
    </div>
  );
}
