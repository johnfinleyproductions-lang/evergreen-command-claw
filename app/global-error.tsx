// app/global-error.tsx
//
// Catches errors thrown inside the root layout itself (where app/error.tsx
// can't help, because error.tsx needs the root layout to be intact). Must
// include its own <html> + <body>. Keep it dependency-free: no external CSS,
// no fancy primitives — this is the absolute last line of defense.

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0d10",
          color: "#e6e7e9",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            border: "1px solid #1e2329",
            borderRadius: 12,
            padding: "2rem",
            background: "#11141a",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Fatal error
          </h1>
          <p
            style={{
              marginTop: 8,
              color: "#9aa0a6",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            The root layout crashed. Try reloading — if it happens again, the
            server logs will have a stack trace tagged with the digest below.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#0b0d10",
              border: "1px solid #1e2329",
              borderRadius: 8,
              fontSize: 12,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#9aa0a6",
            }}
          >
            {error.message || String(error)}
            {error.digest ? `\n\ndigest: ${error.digest}` : null}
          </pre>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                padding: "8px 14px",
                background: "#2d7d5a",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "8px 14px",
                background: "transparent",
                color: "#e6e7e9",
                border: "1px solid #1e2329",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
