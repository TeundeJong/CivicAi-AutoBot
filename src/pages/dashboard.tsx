// src/pages/dashboard.tsx
import { useEffect, useState } from "react";

type EmailStatus = "draft" | "approved" | "sent" | "failed" | "declined";
type LinkedInStatus = "draft" | "approved" | "used" | "declined" | "all";
type Tab = "emails" | "linkedin_posts" | "linkedin_dms";

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

interface LinkedInItem {
  id: string;
  content: string;
  type: "post" | "dm";
  status?: string | null;
  created_at?: string | null;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("emails");

  // -------- EMAIL STATE --------
  const [emails, setEmails] = useState<OutboxRow[]>([]);
  const [emailFilter, setEmailFilter] = useState<EmailStatus | "all">("draft");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // -------- LINKEDIN STATE --------
  const [linkedinPosts, setLinkedinPosts] = useState<LinkedInItem[]>([]);
  const [linkedinDMs, setLinkedinDMs] = useState<LinkedInItem[]>([]);
  const [linkedinFilter, setLinkedinFilter] = useState<LinkedInStatus>("draft");
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);


 // ---------- EMAIL LOADERS ----------
async function loadEmails() {
  setEmailLoading(true);
  setEmailError(null);
  try {
    // altijd ALLE e-mails ophalen, geen status-filter in de API
    const res = await fetch(`/api/admin/emails`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load emails");
    setEmails(json.emails || []);
  } catch (err: any) {
    console.error(err);
    setEmailError(err.message || "Error");
  } finally {
    setEmailLoading(false);
  }
}


  async function updateEmailStatus(id: string, status: EmailStatus) {
    try {
      const res = await fetch("/api/admin/email-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await loadEmails();
    } catch (err: any) {
      alert(err.message || "Kon e-mailstatus niet updaten");
    }
  }

  // ---------- LINKEDIN LOADERS ----------

  async function loadLinkedIn(type: "post" | "dm", status: LinkedInStatus) {
    setLinkedinLoading(true);
    setLinkedinError(null);
    try {
      const params = new URLSearchParams();
      params.set("type", type);
      if (status) params.set("status", status);

      const res = await fetch(`/api/admin/linkedin?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load LinkedIn content");

      const items = (json.items || []) as LinkedInItem[];
      if (type === "post") setLinkedinPosts(items);
      if (type === "dm") setLinkedinDMs(items);
    } catch (err: any) {
      console.error(err);
      setLinkedinError(err.message || "Error");
    } finally {
      setLinkedinLoading(false);
    }
  }

  // ---------- EFFECTS ----------

useEffect(() => {
  if (activeTab === "emails") {
    loadEmails();
  }
}, [activeTab]);


  useEffect(() => {
    if (activeTab === "linkedin_posts") {
      loadLinkedIn("post", linkedinFilter);
    } else if (activeTab === "linkedin_dms") {
      loadLinkedIn("dm", linkedinFilter);
    }
  }, [activeTab, linkedinFilter]);

  // ---------- HELPERS ----------

  const emailCounters = emails.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const linkedinSource =
    activeTab === "linkedin_posts" ? linkedinPosts : linkedinDMs;

  const linkedinCounters = linkedinSource.reduce(
    (acc, item) => {
      const st = (item.status as LinkedInStatus) || "draft";
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Gekopieerd naar klembord ✅");
    } catch (err) {
      console.error(err);
      alert("Kon niet kopiëren (browser blokkeert clipboard?)");
    }
  }

  // ---------- UI ----------

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Topbar / nav */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#6366f1",
            }}
          >
            CivicAi Autobot v3
          </div>
          <h1
            style={{
              fontSize: "1.7rem",
              fontWeight: 700,
              marginTop: "0.2rem",
            }}
          >
            Dashboard
          </h1>
        </div>

        <nav style={{ display: "flex", gap: "0.75rem", fontSize: "0.9rem" }}>
          <a
            href="/"
            style={{
              textDecoration: "none",
              color: "#a5b4fc",
            }}
          >
            Home
          </a>
          <a
            href="/dashboard"
            style={{
              textDecoration: "none",
              color: "#e5e7eb",
              fontWeight: 600,
            }}
          >
            Dashboard
          </a>
        </nav>
      </header>

      {/* Tab selector */}
      <div
        style={{
          display: "inline-flex",
          borderRadius: "999px",
          border: "1px solid #1f2937",
          padding: "0.15rem",
          marginBottom: "1.2rem",
          background: "#020617",
        }}
      >
        {[
          { id: "emails", label: "E-mails" },
          { id: "linkedin_posts", label: "LinkedIn posts" },
          { id: "linkedin_dms", label: "LinkedIn DM drafts" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              fontSize: "0.85rem",
              cursor: "pointer",
              background:
                activeTab === tab.id ? "#4f46e5" : "transparent",
              color: activeTab === tab.id ? "#f9fafb" : "#9ca3af",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Korte uitleg */}
      <p
        style={{
          color: "#9ca3af",
          fontSize: "0.9rem",
          marginBottom: "1.2rem",
        }}
      >
        Keur je content goed, kopieer LinkedIn-posts en DM-teksten, en start
        je cron-runs vanuit Vercel / PowerShell. Alles wat hier staat blijft
        “human-in-the-loop”: jij beslist wat er echt verstuurd wordt.
      </p>

      {/* ---- ACTIEVE TAB ---- */}
      {activeTab === "emails" ? (
       <EmailSection
  emails={emails}
  loading={emailLoading}
  error={emailError}
  filter={emailFilter}
  setFilter={setEmailFilter}
  counters={emailCounters}
  reload={loadEmails}
  updateStatus={updateEmailStatus}
/>

      ) : (
        <LinkedInSection
          type={activeTab === "linkedin_posts" ? "post" : "dm"}
          items={linkedinSource}
          loading={linkedinLoading}
          error={linkedinError}
          filter={linkedinFilter}
          setFilter={setLinkedinFilter}
          counters={linkedinCounters}
          reload={() =>
            loadLinkedIn(
              activeTab === "linkedin_posts" ? "post" : "dm",
              linkedinFilter
            )
          }
          copyToClipboard={copyToClipboard}
        />
      )}
    </div>
  );
}

// ------------- EMAIL SECTION COMPONENT -------------

interface EmailSectionProps {
  emails: OutboxRow[];
  loading: boolean;
  error: string | null;
  filter: EmailStatus | "all";
  setFilter: (v: EmailStatus | "all") => void;
  counters: Record<string, number>;
  reload: () => void;
  updateStatus: (id: string, status: EmailStatus) => void;
}

function EmailSection(props: EmailSectionProps) {
  const {
    emails,
    loading,
    error,
    filter,
    setFilter,
    counters,
    reload,
    updateStatus,
  } = props;
  const visibleEmails =
  filter === "all" ? emails : emails.filter((e) => e.status === filter);


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Stat cards */}
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
              padding: "0.9rem",
              border: "1px solid #111827",
              background:
                st === "approved"
                  ? "linear-gradient(to bottom right,#064e3b,#020617)"
                  : "linear-gradient(to bottom right,#020617,#020617)",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
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

      {/* Filters + refresh */}
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
                    color: "#e5e7eb",
                  }}
                >
                  {st.toUpperCase()}
                </button>
              )
            )}
          </div>
          <button
            onClick={reload}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              fontSize: "0.8rem",
              cursor: "pointer",
              background: "transparent",
              color: "#e5e7eb",
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

        {/* Tabel */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #1f2933",
            overflow: "hidden",
            background: "#020617",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
            <thead style={{ background: "#020617" }}>
              <tr>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Lead</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>E-mail</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Subject</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Acties</th>
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
                visibleEmails.map((e) => (
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
                              color: "#f9fafb",
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
                              color: "#f9fafb",
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
                            color: "#f9fafb",
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

// ------------- LINKEDIN SECTION COMPONENT -------------

interface LinkedInSectionProps {
  type: "post" | "dm";
  items: LinkedInItem[];
  loading: boolean;
  error: string | null;
  filter: LinkedInStatus;
  setFilter: (v: LinkedInStatus) => void;
  counters: Record<string, number>;
  reload: () => void;
  copyToClipboard: (text: string) => void;
}

function LinkedInSection(props: LinkedInSectionProps) {
  const {
    type,
    items,
    loading,
    error,
    filter,
    setFilter,
    counters,
    reload,
    copyToClipboard,
  } = props;

  const title = type === "post" ? "LinkedIn posts" : "LinkedIn DM drafts";
  const description =
    type === "post"
      ? "Buffer aan LinkedIn posts die je zelf kunt kopiëren en plaatsen."
      : "Korte DM-teksten om handmatig in LinkedIn te plakken en te versturen.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Stat cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: "0.75rem",
        }}
      >
        {["draft", "approved", "used", "declined"].map((st) => (
          <div
            key={st}
            style={{
              borderRadius: "0.75rem",
              padding: "0.9rem",
              border: "1px solid #111827",
              background: "linear-gradient(to bottom right,#020617,#020617)",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
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

      {/* Titel + filters */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "0.75rem",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{title}</h2>
            <p style={{ fontSize: "0.85rem", color: "#9ca3af" }}>{description}</p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as LinkedInStatus)}
              style={{
                background: "#020617",
                borderRadius: "999px",
                border: "1px solid #4b5563",
                padding: "0.3rem 0.7rem",
                color: "#e5e7eb",
                fontSize: "0.8rem",
              }}
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="used">Used</option>
              <option value="declined">Declined</option>
              <option value="all">All</option>
            </select>
            <button
              onClick={reload}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: "1px solid #4b5563",
                fontSize: "0.8rem",
                cursor: "pointer",
                background: "transparent",
                color: "#e5e7eb",
              }}
            >
              Refresh
            </button>
          </div>
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

        {/* Lijst met content */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #1f2933",
            background: "#020617",
            padding: "0.6rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            maxHeight: "28rem",
            overflowY: "auto",
          }}
        >
          {loading && <div style={{ padding: "0.4rem" }}>Laden...</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: "0.4rem" }}>
              Nog geen items gevonden. Zodra de bot LinkedIn content
              aanmaakt, verschijnt het hier.
            </div>
          )}
          {!loading &&
            items.map((item) => (
              <article
                key={item.id}
                style={{
                  borderRadius: "0.6rem",
                  border: "1px solid #111827",
                  padding: "0.55rem 0.7rem",
                  background: "#020617",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.75rem",
                    color: "#9ca3af",
                  }}
                >
                  <span>{item.status || "draft"}</span>
                  {item.created_at && (
                    <span>
                      {new Date(item.created_at).toLocaleDateString()}{" "}
                      {new Date(item.created_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "0.9rem",
                    lineHeight: 1.4,
                  }}
                >
                  {item.content}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "0.4rem",
                    marginTop: "0.2rem",
                  }}
                >
                  <button
                    onClick={() => copyToClipboard(item.content)}
                    style={{
                      padding: "0.25rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid #4b5563",
                      background: "transparent",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      color: "#e5e7eb",
                    }}
                  >
                    Copy
                  </button>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
