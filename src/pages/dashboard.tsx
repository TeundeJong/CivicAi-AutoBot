import Head from "next/head";
import { useEffect, useState } from "react";

type EmailRow = {
  id: string;
  to_email: string;
  subject: string;
  status: "draft" | "approved" | "scheduled" | "sent" | "failed";
  campaign_name: string | null;
  created_at: string;
  sent_at: string | null;
  error: string | null;
};

const STATUS_LABEL: Record<EmailRow["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  scheduled: "Scheduled",
  sent: "Sent",
  failed: "Failed",
};

const STATUS_COLOR: Record<EmailRow["status"], string> = {
  draft: "bg-gray-700 text-gray-100",
  approved: "bg-green-600 text-white",
  scheduled: "bg-amber-500 text-black",
  sent: "bg-blue-600 text-white",
  failed: "bg-red-600 text-white",
};

export default function DashboardPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<EmailRow["status"] | "all">("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/emails");
      if (!res.ok) {
        throw new Error(`Failed to load emails: ${res.status}`);
      }
      const json = await res.json();
      setEmails(json.emails || []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: EmailRow["status"]) {
    try {
      setError(null);
      const res = await fetch("/api/admin/email-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to update: ${res.status}`);
      }
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status } : e))
      );
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    }
  }

  const visibleEmails =
    filter === "all" ? emails : emails.filter((e) => e.status === filter);

  return (
    <>
      <Head>
        <title>CivicAi Mailman · Dashboard</title>
      </Head>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">CivicAi Mailman</h1>
            <p className="text-sm text-slate-400">
              Overview of generated outreach emails for ContractGuard AI.
            </p>
          </div>
          <button
            onClick={load}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
          >
            Refresh
          </button>
        </header>

        <main className="px-6 py-4">
          {error && (
            <div className="mb-3 rounded-md bg-red-900/40 border border-red-600 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400 mr-2">Filter status:</span>
            {(["all", "draft", "approved", "scheduled", "sent", "failed"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() =>
                    setFilter(s === "all" ? "all" : (s as EmailRow["status"]))
                  }
                  className={`rounded-full px-3 py-1 text-xs border ${
                    filter === s || (filter === "all" && s === "all")
                      ? "border-sky-400 bg-sky-500/20"
                      : "border-slate-700 bg-slate-900"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s as EmailRow["status"]]}
                </button>
              )
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/70 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    To
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Campaign
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Sent
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleEmails.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      No emails yet.
                    </td>
                  </tr>
                )}
                {visibleEmails.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-850 last:border-none hover:bg-slate-900/40"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs">{e.to_email}</div>
                    </td>
                    <td className="px-3 py-2 align-top max-w-md">
                      <div className="truncate">{e.subject}</div>
                      {e.error && (
                        <div className="mt-1 text-xs text-red-400">
                          {e.error}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="text-xs text-slate-400">
                        {e.campaign_name || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[e.status]}`}
                      >
                        {STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-400">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-400">
                      {e.sent_at
                        ? new Date(e.sent_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => updateStatus(e.id, "draft")}
                          className="rounded-md bg-gray-700 px-2 py-1 text-[11px] hover:bg-gray-600"
                        >
                          Draft
                        </button>
                        <button
                          onClick={() => updateStatus(e.id, "approved")}
                          className="rounded-md bg-green-600 px-2 py-1 text-[11px] hover:bg-green-500"
                        >
                          Approved
                        </button>
                        <button
                          onClick={() => updateStatus(e.id, "failed")}
                          className="rounded-md bg-red-600 px-2 py-1 text-[11px] hover:bg-red-500"
                        >
                          Declined
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="mt-3 text-xs text-slate-400">
              Loading latest data...
            </div>
          )}
        </main>
      </div>
    </>
  );
}
