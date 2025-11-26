// src/pages/dashboard.tsx
import { useEffect, useState } from "react";

type EmailStatus = "draft" | "approved" | "sent" | "failed" | "declined";

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  created_at: string;
  updated_at: string;
  leads?: { name?: string | null; company?: string | null } | null;
}

export default function DashboardPage() {
  const [emails, setEmails] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<EmailStatus | "all">("draft");
  const [error, setError] = useState<string | null>(null);

  async function loadEmails(status: EmailStatus | "all") {
    setLoading(true);
    setError(null);
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await fetch(`/api/admin/emails${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load emails");
      setEmails(json.emails || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmails(filter);
  }, [filter]);

  async function updateStatus(id: string, status: EmailStatus) {
    try {
      const res = await fetch("/api/admin/email-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await loadEmails(filter);
    } catch (err: any) {
      alert(err.message || "Kon status niet updaten");
    }
  }

  const counters = emails.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "1.5rem",
      color: "white",               // << HIER DE FIX
      backgroundColor: "#020617",   // mooi donker blauw/zwart
      minHeight: "100vh",
      padding: "1.5rem",
    }}
  >

      <section>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Dashboard
        </h1>
        <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
          Hier keur je e-mails goed, houd je overzicht en start je cron-runs
          vanuit Vercel / PowerShell.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: "0.75rem",
        }}
      >
        {["draft", "approved", "sent", "failed", "declined"].map((st) => (
          <div
            key={st}
            style={{
              borderRadius: "0.75rem",
              padding: "0.75rem",
              border: "1px solid #1f2933",
              background: "#020617",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#9ca3af",
                marginBottom: "0.25rem",
              }}
            >
              {st.toUpperCase()}
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              {counters[st] || 0}
            </div>
          </div>
        ))}
      </section>

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["all", "draft", "approved", "sent", "failed", "declined"] as const).map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setFilter(st)}
                  style={{
                    padding: "0.3rem 0.7rem",
                    borderRadius: "999px",
                    border:
                      filter === st
                        ? "1px solid #6366f1"
                        : "1px solid #1f2933",
                    background:
                      filter === st ? "#111827" : "transparent",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {st.toUpperCase()}
                </button>
              )
            )}
          </div>
          <button
            onClick={() => loadEmails(filter)}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #b91c1c",
              color: "#fecaca",
              background: "#450a0a",
              marginBottom: "0.75rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #1f2933",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
            <thead style={{ background: "#020617", color: "white" }}>

              <tr>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Lead</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>E-mail</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Subject</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>
                  Acties
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ padding: "0.8rem", textAlign: "center" }}>
                    Laden...
                  </td>
                </tr>
              )}
              {!loading && emails.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "0.8rem", textAlign: "center" }}>
                    Geen e-mails gevonden.
                  </td>
                </tr>
              )}
              {!loading &&
                emails.map((e) => (
                  <tr
                    key={e.id}
                    style={{
                      borderTop: "1px solid #111827",
                      background:
                        e.status === "draft"
                          ? "#020617"
                          : e.status === "approved"
                          ? "#022c22"
                          : e.status === "sent"
                          ? "#020617"
                          : e.status === "failed"
                          ? "#450a0a"
                          : "#111827",
                    }}
                  >
                    <td style={{ padding: "0.5rem" }}>
                      <div>{e.leads?.name || "-"}</div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                        {e.leads?.company || ""}
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                      {e.to_email}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{e.subject}</td>
                    <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                      {e.status.toUpperCase()}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.status === "draft" && (
                        <>
                          <button
                            onClick={() => updateStatus(e.id, "approved")}
                            style={{
                              padding: "0.25rem 0.6rem",
                              borderRadius: "999px",
                              border: "none",
                              background: "#16a34a",
                              fontSize: "0.75rem",
                              marginRight: "0.25rem",
                              cursor: "pointer",
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateStatus(e.id, "declined")}
                            style={{
                              padding: "0.25rem 0.6rem",
                              borderRadius: "999px",
                              border: "none",
                              background: "#b91c1c",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {e.status === "approved" && (
                        <button
                          onClick={() => updateStatus(e.id, "draft")}
                          style={{
                            padding: "0.25rem 0.6rem",
                            borderRadius: "999px",
                            border: "none",
                            background: "#4b5563",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          Terug naar draft
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
