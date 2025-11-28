// src/pages/dashboard.tsx
import { useEffect, useState } from "react";
import Papa from "papaparse";

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

  // -------- EMAIL EDITOR --------
  const [selectedEmail, setSelectedEmail] = useState<OutboxRow | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  // -------- LINKEDIN STATE --------
  const [linkedinPosts, setLinkedinPosts] = useState<LinkedInItem[]>([]);
  const [linkedinDMs, setLinkedinDMs] = useState<LinkedInItem[]>([]);
  const [linkedinFilter, setLinkedinFilter] =
    useState<LinkedInStatus>("draft");
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);

  // --------- BULK LEADS ---------
  const [bulkInput, setBulkInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);

    const [sendingEnabled, setSendingEnabled] = useState<boolean | null>(null);
  const [sendingToggleLoading, setSendingToggleLoading] = useState(false);

  async function fetchSendingEnabled() {
    try {
      const res = await fetch("/api/admin/sending-toggle");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load sending flag");
      setSendingEnabled(!!json.enabled);
    } catch (err) {
      console.error(err);
      // laat 'm dan gewoon null; UI laat knop dan niet zien
    }
  }

  async function handleToggleSending() {
    if (sendingEnabled === null) return;
    setSendingToggleLoading(true);
    try {
      const res = await fetch("/api/admin/sending-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !sendingEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Toggle failed");
      setSendingEnabled(!!json.enabled);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Kon auto-send niet aanpassen");
    } finally {
      setSendingToggleLoading(false);
    }
  }


  // ---------- BULK IMPORT ----------

  async function handleBulkImport() {
    // 1) CSV-bestand → lines string maken
    if (bulkFile) {
      setBulkLoading(true);
      try {
        const text = await bulkFile.text();
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
        });

        const rows = (parsed.data as any[])
          .map((row) => {
            if (!row) return null;
            const keys = Object.keys(row);

            const emailKey =
              keys.find((k) => k.toLowerCase() === "email") ||
              keys.find((k) => k.toLowerCase().includes("email"));
            const email = emailKey ? String(row[emailKey]).trim() : "";

            if (!email || !email.includes("@")) return null;

            // name
            let name =
              row.name ||
              row.Name ||
              row["First Name"] ||
              row["First_Name"] ||
              null;

            if (!name) {
              const firstKey = keys.find(
                (k) =>
                  k.toLowerCase().includes("first") &&
                  k.toLowerCase().includes("name")
              );
              const lastKey = keys.find(
                (k) =>
                  k.toLowerCase().includes("last") &&
                  k.toLowerCase().includes("name")
              );
              const first = firstKey ? row[firstKey] : "";
              const last = lastKey ? row[lastKey] : "";
              const combined = `${first ?? ""} ${last ?? ""}`.trim();
              name = combined || null;
            }

            // company
            const companyKey =
              keys.find((k) => k.toLowerCase() === "company") ||
              keys.find((k) => k.toLowerCase().includes("company"));
            const company =
              row.company ||
              row.Company ||
              row["Company Name"] ||
              (companyKey ? row[companyKey] : null) ||
              null;

            return {
              email: String(email),
              name: name ? String(name) : "",
              company: company ? String(company) : "",
            };
          })
          .filter(Boolean) as { email: string; name: string; company: string }[];

        if (!rows.length) {
          alert(
            "Geen geldige e-mailadressen in de CSV gevonden. Check of er een kolom met 'Email' of 'Work Email' in staat."
          );
          console.log(
            "Eerste row keys:",
            Object.keys((parsed.data as any[])[0] || {})
          );
          setBulkLoading(false);
          return;
        }

        // zelfde formaat als textarea-mode:
        const lines = rows
          .map((r) => {
            if (r.name || r.company) {
              return `${r.name || ""}, ${r.company || ""}, ${r.email}`;
            }
            return r.email;
          })
          .join("\n");

        const res = await fetch("/api/admin/bulk-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines,
            makeJobs: true,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Bulk import failed");
alert(
  `CSV import: ${json.inserted} leads en ${json.emailsCreated || 0} e-mail drafts aangemaakt.`
);


        // reset file + textarea
        const inputEl = document.getElementById(
          "bulk-file-input"
        ) as HTMLInputElement | null;
        if (inputEl) inputEl.value = "";
        setBulkFile(null);
        setBulkInput("");

        await new Promise((r) => setTimeout(r, 250));
        await loadEmails();
        setBulkLoading(false);
        return;
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Unknown CSV error");
        setBulkLoading(false);
        return;
      }
    }

    // 2) Geen CSV: textarea-mode
    if (!bulkInput.trim()) {
      alert("Plak eerst een paar e-mailadressen of upload een CSV.");
      return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/bulk-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: bulkInput,
          makeJobs: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk import failed");

   alert(
  `Added ${json.inserted} leads and created ${json.emailsCreated || 0} email drafts.`
);


      setBulkInput("");
      await new Promise((r) => setTimeout(r, 250));
      await loadEmails();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Unknown error");
    } finally {
      setBulkLoading(false);
    }
  }

  // ---------- EMAIL LOADERS ----------

  async function loadEmails() {
    setEmailLoading(true);
    setEmailError(null);
    try {
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

  // ---------- EMAIL EDITOR HELPERS ----------

  function openEmailEditor(email: OutboxRow) {
    setSelectedEmail(email);
    setEditSubject(email.subject);
    setEditBody(email.body);
  }

  async function saveEmailEdit() {
    if (!selectedEmail) return;

    try {
      const res = await fetch("/api/admin/email-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedEmail.id,
          subject: editSubject,
          body: editBody,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update email");

      setSelectedEmail(null);
      await loadEmails();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Kon e-mail niet opslaan");
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
      fetchSendingEnabled();
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
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
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

               <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <nav
            style={{ display: "flex", gap: "0.75rem", fontSize: "0.9rem" }}
          >
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

          {sendingEnabled !== null && (
            <button
              onClick={handleToggleSending}
              disabled={sendingToggleLoading}
              style={{
                padding: "0.3rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid " + (sendingEnabled ? "#16a34a" : "#b91c1c"),
                fontSize: "0.8rem",
                cursor: "pointer",
                background: sendingEnabled ? "#022c22" : "#450a0a",
                color: "#f9fafb",
                opacity: sendingToggleLoading ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {sendingToggleLoading
                ? "Saving..."
                : sendingEnabled
                ? "Auto-send: ON"
                : "Auto-send: OFF"}
            </button>
          )}
        </div>
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

      {/* Bulk import leads + queue jobs */}
      <section
        style={{
          marginTop: "0.5rem",
          marginBottom: "1.5rem",
          maxWidth: "640px",
          padding: "0.75rem 1rem",
          borderRadius: "0.75rem",
          border: "1px solid #1f2937",
          background: "#020617",
        }}
      >
        <h2 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>
          Bulk add leads & queue jobs
        </h2>
        <p
          style={{
            fontSize: "0.8rem",
            color: "#9ca3af",
            marginBottom: "0.5rem",
          }}
        >
          One contact per line. Format:{" "}
          <code>Name, Company, email@domain.com</code> or just{" "}
          <code>email@domain.com</code>. The bot will create email drafts
          and LinkedIn DM drafts for each lead.
        </p>

        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            borderRadius: "0.5rem",
            border: "1px solid #1f2937",
            background: "#020617",
            color: "#e5e7eb",
            padding: "0.5rem",
            fontSize: "0.85rem",
            marginBottom: "0.5rem",
            resize: "vertical",
          }}
          placeholder={`Example:\nJohn Smith, ACME Corp, john@acme.com\ninfo@contractlawyer.com`}
        />

        {/* CSV upload */}
        <input
          id="bulk-file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
          style={{
            marginBottom: "0.5rem",
            padding: "0.4rem",
            border: "1px solid #1f2937",
            borderRadius: "0.5rem",
            background: "#020617",
            color: "#e5e7eb",
            fontSize: "0.8rem",
            display: "block",
          }}
        />

        <button
          onClick={handleBulkImport}
          disabled={bulkLoading}
          style={{
            padding: "0.35rem 0.9rem",
            borderRadius: "999px",
            border: "none",
            background: "#4f46e5",
            color: "#f9fafb",
            fontSize: "0.8rem",
            cursor: "pointer",
            opacity: bulkLoading ? 0.6 : 1,
          }}
        >
          {bulkLoading ? "Saving…" : "Save leads + create jobs"}
        </button>
      </section>

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
          onOpenEmail={openEmailEditor}
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

      {/* SIMPLE EMAIL EDIT MODAL */}
      {selectedEmail && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "720px",
              maxHeight: "80vh",
              background: "#020617",
              borderRadius: "0.75rem",
              border: "1px solid #1f2937",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 600,
                }}
              >
                View / edit email
              </h2>
              <button
                onClick={() => setSelectedEmail(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: "1.2rem",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: "0.85rem",
                color: "#9ca3af",
              }}
            >
              <div>
                <strong>To:</strong> {selectedEmail.to_email}
              </div>
              <div>
                <strong>Status:</strong> {selectedEmail.status.toUpperCase()}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                }}
              >
                Subject
              </label>
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: "0.5rem",
                  border: "1px solid #1f2937",
                  background: "#020617",
                  color: "#e5e7eb",
                  padding: "0.4rem 0.6rem",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                }}
              >
                Body
              </label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={14}
                style={{
                  width: "100%",
                  borderRadius: "0.5rem",
                  border: "1px solid #1f2937",
                  background: "#020617",
                  color: "#e5e7eb",
                  padding: "0.5rem 0.6rem",
                  fontSize: "0.9rem",
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <button
                onClick={() => setSelectedEmail(null)}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "999px",
                  border: "1px solid #4b5563",
                  background: "transparent",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  color: "#e5e7eb",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEmailEdit}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "999px",
                  border: "none",
                  background: "#4f46e5",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  color: "#f9fafb",
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
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
  onOpenEmail: (email: OutboxRow) => void;
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
    onOpenEmail,
  } = props;
  async function handleBulkStatus(
    status: EmailStatus,
    limit?: number
  ) {
    const source =
      filter === "all" ? emails : emails.filter((e) => e.status === filter);

    const slice = typeof limit === "number" ? source.slice(0, limit) : source;
    const ids = slice.map((e) => e.id);

    if (!ids.length) {
      alert("Geen e-mails om te updaten voor deze selectie.");
      return;
    }

    try {
      const res = await fetch("/api/admin/email-bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk update failed");
      await reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Bulk update error");
    }
  }

  async function handleSendBatchNow() {
    try {
      const res = await fetch("/api/admin/email-send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }), // max 50 per klik, rest vangt cron op
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send batch failed");
      alert(
        `Batch send: ${json.sent} e-mails verstuurd vanaf ${json.from || "account"}`
      );
      await reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Send batch error");
    }
  }

  async function handleSendSingleNow(id: string) {
    try {
      const res = await fetch("/api/admin/email-send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send now failed");
      await reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Send now error");
    }
  }

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
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(
              ["all", "draft", "approved", "sent", "failed", "declined"] as const
            ).map((st) => (
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
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {/* Bulk approve knoppen */}
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button
                onClick={() => handleBulkStatus("approved", 10)}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid #16a34a",
                  background: "transparent",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: "#bbf7d0",
                }}
              >
                Approve 10
              </button>
              <button
                onClick={() => handleBulkStatus("approved", 25)}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid #16a34a",
                  background: "transparent",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: "#bbf7d0",
                }}
              >
                Approve 25
              </button>
              <button
                onClick={() => handleBulkStatus("approved", 50)}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid #16a34a",
                  background: "transparent",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: "#bbf7d0",
                }}
              >
                Approve 50
              </button>
              <button
                onClick={() => handleBulkStatus("approved")}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid #16a34a",
                  background: "transparent",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: "#bbf7d0",
                }}
              >
                Approve all
              </button>
            </div>

            <button
              onClick={handleSendBatchNow}
              style={{
                padding: "0.3rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid #4b5563",
                fontSize: "0.8rem",
                cursor: "pointer",
                background: "#111827",
                color: "#e5e7eb",
              }}
            >
              Send batch now
            </button>

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
                <th style={{ padding: "0.5rem", textAlign: "left" }}>
                  E-mail
                </th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>
                  Subject
                </th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>
                  Status
                </th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>
                  Acties
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "0.8rem", textAlign: "center" }}
                  >
                    Laden...
                  </td>
                </tr>
              )}
              {!loading && visibleEmails.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "0.8rem", textAlign: "center" }}
                  >
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
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#9ca3af",
                        }}
                      >
                        {e.leads?.company || ""}
                      </div>
                    </td>
                    <td
                      style={{ padding: "0.5rem", fontSize: "0.8rem" }}
                    >
                      {e.to_email}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{e.subject}</td>
                    <td
                      style={{ padding: "0.5rem", fontSize: "0.8rem" }}
                    >
                      {e.status.toUpperCase()}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        onClick={() => onOpenEmail(e)}
                        style={{
                          padding: "0.25rem 0.6rem",
                          borderRadius: "999px",
                          border: "1px solid #4b5563",
                          background: "transparent",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          color: "#e5e7eb",
                          marginRight: "0.25rem",
                        }}
                      >
                        View / edit
                      </button>

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
                          onClick={() => handleSendSingleNow(e.id)}
                          style={{
                            padding: "0.25rem 0.6rem",
                            borderRadius: "999px",
                            border: "none",
                            background: "#0ea5e9",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            color: "#0f172a",
                            marginRight: "0.25rem",
                          }}
                        >
                          Send now
                        </button>
                      )}

                      {(e.status === "approved" ||
                        e.status === "declined") && (
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
                          Back to draft
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

  async function handleGenerate(count: number) {
    try {
      const res = await fetch("/api/admin/linkedin-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, count }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generate failed");
      alert(
        `Generated ${json.inserted} LinkedIn ${
          type === "post" ? "posts" : "DMs"
        }.`
      );
      await reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "LinkedIn generate error");
    }
  }

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
              background:
                "linear-gradient(to bottom right,#020617,#020617)",
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

      {/* Titel + filters + generate */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "0.75rem",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{title}</h2>
            <p style={{ fontSize: "0.85rem", color: "#9ca3af" }}>
              {description}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => handleGenerate(type === "post" ? 10 : 20)}
              style={{
                padding: "0.3rem 0.8rem",
                borderRadius: "999px",
                border: "1px solid #6366f1",
                fontSize: "0.8rem",
                cursor: "pointer",
                background: "#111827",
                color: "#e5e7eb",
              }}
            >
              Generate {type === "post" ? "10 posts" : "20 DMs"}
            </button>

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
