"use client";

/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself,
 * where no route boundary can. It replaces the entire document, so it must
 * render its own <html>/<body> and cannot rely on globals.css or any app
 * component — plain inline styles only.
 */
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
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          background: "#111",
          color: "#eee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "24px" }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: "28rem", color: "#aaa", fontSize: "14px" }}>
          The app hit an unexpected error. Try again — if it keeps happening,
          reload the page.
        </p>
        {error.digest ? (
          <p style={{ margin: 0, color: "#777", fontSize: "12px" }}>
            Error reference: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: "8px",
            padding: "8px 20px",
            borderRadius: "8px",
            border: "1px solid #444",
            background: "#222",
            color: "#eee",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
