import { useEffect, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      try {
        const res = await fetch("/api/jobs/list");
        const json = await res.json();
        setJobs(json.jobs ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
      }}
    >
      {/* Top navigation bar */}
      <div
        style={{
          borderBottom: "1px solid #1f2937",
          background: "#020617",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
            CivicAi Autobot · <span style={{ color: "#e5e7eb" }}>Console</span>
          </div>
          <nav style={{ display: "flex", gap: "0.5rem", fontSize: "0.875rem" }}>
            <Link
              href="/"
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                background: "#111827",
                color: "#e5e7eb",
                textDecoration: "none",
              }}
            >
              Jobs
            </Link>
            <Link
              href="/dashboard"
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                background: "#0284c7",
                color: "#f9fafb",
                textDecoration: "none",
              }}
            >
              Email dashboard
            </Link>
            {/* Later kun je hier meer toevoegen, bv:
            <Link href="/social" ...>Social posts</Link>
            <Link href="/dms" ...>DM overview</Link>
            */}
          </nav>
        </div>
      </div>

      {/* Page content */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "2.5rem 1rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
          CivicAi Autobot – Job Queue
        </h1>
        <p style={{ marginBottom: "1.5rem", color: "#9ca3af" }}>
          Simpele view om te zien welke AI-jobs in de rij staan.
        </p>

        {loading && <p>Loading...</p>}

        {!loading && (
          <table
            style={{
              width: "100%",
              fontSize: "0.875rem",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#020617",
                  borderBottom: "1px solid #1f2937",
                }}
              >
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Status</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>
                  Created
                </th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  style={{ borderBottom: "1px solid #1f2937" }}
                >
                  <td style={{ padding: "0.5rem" }}>{job.type}</td>
                  <td style={{ padding: "0.5rem" }}>{job.status}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {job.created_at
                      ? new Date(job.created_at).toLocaleString()
                      : "-"}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {job.updated_at
                      ? new Date(job.updated_at).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: "0.75rem", color: "#6b7280" }}
                  >
                    Nog geen jobs gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
