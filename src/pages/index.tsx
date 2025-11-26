// src/pages/index.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.3fr)",
        gap: "2.5rem",
        alignItems: "center",
      }}
    >
      <section>
        <p
          style={{
            fontSize: "0.8rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#a5b4fc",
            marginBottom: "0.5rem",
          }}
        >
          CivicAi Autobot v3
        </p>
        <h1
          style={{
            fontSize: "2.4rem",
            lineHeight: 1.1,
            fontWeight: 800,
            marginBottom: "1rem",
          }}
        >
          Jouw AI sales assistent,
          <br />
          zonder spamgedrag.
        </h1>
        <p style={{ color: "#9ca3af", marginBottom: "1.5rem", maxWidth: 520 }}>
          Genereer batches e-mails, keur ze zelf goed en laat de bot ze{" "}
          <strong>netjes gedoseerd</strong> versturen vanaf vier inboxen. Plus
          LinkedIn-content en DM-concepten in de planning.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <Link href="/dashboard" legacyBehavior>
            <a
              style={{
                padding: "0.7rem 1.2rem",
                borderRadius: "999px",
                background:
                  "linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)",
                fontWeight: 600,
              }}
            >
              Open dashboard
            </a>
          </Link>
        </div>

        <ul
          style={{
            fontSize: "0.9rem",
            color: "#9ca3af",
            lineHeight: 1.6,
          }}
        >
          <li>• E-mails gegenereerd met OpenAI, per lead</li>
          <li>• Jij approve’t, de bot verstuurt netjes binnen limieten</li>
          <li>• Overzicht per mailbox: limiet, verstuurd, resterend</li>
        </ul>
      </section>

      <section
        style={{
          borderRadius: "1rem",
          border: "1px solid #1f2933",
          padding: "1.25rem 1.4rem",
          background:
            "radial-gradient(circle at top, #111827, #020617 60%)",
        }}
      >
        <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
          Vandaag
        </p>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
          Wat de bot voor je doet:
        </h2>
        <ul
          style={{
            fontSize: "0.9rem",
            color: "#d1d5db",
            lineHeight: 1.8,
          }}
        >
          <li>✅ Nieuwe leads → klik &amp; “Generate email job”</li>
          <li>✅ Cron job → e-mails worden geschreven als drafts</li>
          <li>✅ Jij klikt “Approve” → bot stuurt binnen limieten</li>
          <li>✅ Alles logt in Supabase voor overzicht</li>
        </ul>
      </section>
    </div>
  );
}
