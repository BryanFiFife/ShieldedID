import { useEffect, useMemo, useState } from "react";

interface SessionEntry {
  id: string;
  pairwiseSubjectId: string;
  verifiedAt: string;
  claims: Array<{ type: string; value: boolean | number }>;
  assuranceLevel?: number;
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  useEffect(() => {
    const poll = async () => {
      const response = await fetch("/api/sessions");
      if (!response.ok) return;
      const data = (await response.json()) as { total: number; sessions: SessionEntry[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    };
    const timer = window.setInterval(() => poll().catch(() => undefined), 5000);
    poll().catch(() => undefined);
    return () => window.clearInterval(timer);
  }, []);

  const continuityMap = useMemo(() => {
    const seen = new Map<string, string>();
    const results = new Map<string, string>();
    for (const session of sessions.slice().reverse()) {
      if (seen.has(session.pairwiseSubjectId)) {
        results.set(session.id, seen.get(session.pairwiseSubjectId)!);
      } else {
        seen.set(session.pairwiseSubjectId, session.verifiedAt);
      }
    }
    return results;
  }, [sessions]);

  return (
    <div className="panel">
      <h2>Session History</h2>
      {sessions.length === 0 && <p>No verifications yet.</p>}
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <strong>{new Date(session.verifiedAt).toLocaleString()}</strong> � {session.claims
              .map((claim) => `${claim.type}:${claim.value}`)
              .join(", ")}
            {continuityMap.has(session.id) && (
              <span> | Same user as {new Date(continuityMap.get(session.id)!).toLocaleString()}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
