// src/pages/_app.tsx
import type { AppProps } from "next/app";
import Link from "next/link";
import "../styles/globals.css"; // laat zoals je had

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div style={{ minHeight: "100vh", background: "#050816", color: "#f9fafb" }}>
      <header
        style={{
          borderBottom: "1px solid #1f2933",
          padding: "0.75rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#050816f0",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
          CivicAi Autobot <span style={{ opacity: 0.6 }}>v3</span>
        </div>
        <nav style={{ display: "flex", gap: "0.75rem", fontSize: "0.9rem" }}>
          <Link href="/" legacyBehavior>
            <a style={{ padding: "0.35rem 0.8rem" }}>Home</a>
          </Link>
          <Link href="/dashboard" legacyBehavior>
            <a
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: "1px solid #4f46e5",
                background: "#4f46e5",
              }}
            >
              Dashboard
            </a>
          </Link>
        </nav>
      </header>
      <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        <Component {...pageProps} />
      </main>
    </div>
  );
}
