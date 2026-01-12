import React, { useEffect, useState, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "./Dashboard.css";

/**
 * Shielded ID Registry Admin Dashboard
 * File: apps/registry-server/src/admin/Dashboard.tsx
 * 
 * Real-time metrics and audit log visualization
 */

interface DashboardMetrics {
  verificationCount: number;
  failureRate: number;
  avgLatency: number;
  revokedKeysCount: number;
  activeWallets: number;
  activeSessions: number;
}

interface AuditLogEntry {
  logId: string;
  eventType: string;
  result: "SUCCESS" | "FAILURE" | "ERROR";
  errorReason?: string;
  requestId: string;
  durationMs: number;
  createdAt: string;
}

interface TimeSeriesData {
  timestamp: string;
  verifications: number;
  failures: number;
  avgLatency: number;
}

/**
 * Main Dashboard Component
 */
export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch metrics from registry API
   */
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  /**
   * Fetch time series data
   */
  const fetchTimeSeries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics/timeseries?hours=24");
      if (!res.ok) throw new Error("Failed to fetch time series");
      const data = await res.json();
      setTimeSeries(data);
    } catch (e) {
      console.error("Failed to fetch time series:", e);
    }
  }, []);

  /**
   * Fetch audit logs
   */
  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-logs?limit=100");
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setAuditLogs(data);
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
    }
  }, []);

  /**
   * Initial load and polling
   */
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMetrics(), fetchTimeSeries(), fetchAuditLogs()])
      .finally(() => setLoading(false));

    // Poll metrics every 5 seconds
    const interval = setInterval(() => {
      fetchMetrics();
      fetchTimeSeries();
    }, 5000);

    // Poll audit logs every 10 seconds
    const auditInterval = setInterval(fetchAuditLogs, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(auditInterval);
    };
  }, [fetchMetrics, fetchTimeSeries, fetchAuditLogs]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="dashboard-error">Error: {error}</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🛡️ Shielded ID Registry Admin</h1>
        <p className="dashboard-subtitle">Real-time metrics and audit logs</p>
      </header>

      {/* Key Metrics Cards */}
      <section className="metrics-section">
        <div className="metrics-grid">
          <MetricCard
            label="Verifications (24h)"
            value={metrics?.verificationCount ?? 0}
            icon="✓"
            color="green"
          />
          <MetricCard
            label="Failure Rate"
            value={`${((metrics?.failureRate ?? 0) * 100).toFixed(2)}%`}
            icon="✗"
            color={((metrics?.failureRate ?? 0) * 100) > 5 ? "red" : "green"}
          />
          <MetricCard
            label="Avg Latency"
            value={`${(metrics?.avgLatency ?? 0).toFixed(0)}ms`}
            icon="⏱"
            color={((metrics?.avgLatency ?? 0) > 500) ? "yellow" : "green"}
          />
          <MetricCard
            label="Active Wallets"
            value={metrics?.activeWallets ?? 0}
            icon="👛"
            color="blue"
          />
          <MetricCard
            label="Revoked Keys"
            value={metrics?.revokedKeysCount ?? 0}
            icon="🔐"
            color="orange"
          />
          <MetricCard
            label="Active Sessions"
            value={metrics?.activeSessions ?? 0}
            icon="📊"
            color="purple"
          />
        </div>
      </section>

      {/* Charts */}
      <section className="charts-section">
        <div className="chart-container">
          <h2>Verification Volume (24h)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="verifications"
                stroke="#10b981"
                strokeWidth={2}
                name="Successful"
              />
              <Line
                type="monotone"
                dataKey="failures"
                stroke="#ef4444"
                strokeWidth={2}
                name="Failed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h2>Average Latency (24h)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgLatency" fill="#3b82f6" name="Latency (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Audit Log */}
      <section className="audit-section">
        <h2>Recent Events</h2>
        <div className="audit-log">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event Type</th>
                <th>Result</th>
                <th>Request ID</th>
                <th>Latency (ms)</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.logId} className={`result-${log.result.toLowerCase()}`}>
                  <td className="timestamp">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="event-type">
                    <span className="badge">{log.eventType}</span>
                  </td>
                  <td className={`result result-${log.result.toLowerCase()}`}>
                    {log.result}
                  </td>
                  <td className="request-id" title={log.requestId}>
                    {log.requestId.substring(0, 12)}...
                  </td>
                  <td className="latency">
                    {log.durationMs}ms
                  </td>
                  <td className="details">
                    {log.errorReason && (
                      <span className="error-reason">{log.errorReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Health Status */}
      <section className="health-section">
        <h2>Registry Health</h2>
        <HealthIndicator label="API Endpoint" status="healthy" />
        <HealthIndicator label="Database" status="healthy" />
        <HealthIndicator label="Cache" status="healthy" />
        <HealthIndicator label="Revocation Index" status="healthy" />
      </section>
    </div>
  );
};

/**
 * Metric Card Component
 */
interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, color }) => (
  <div className={`metric-card metric-card-${color}`}>
    <div className="metric-icon">{icon}</div>
    <div className="metric-content">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  </div>
);

/**
 * Health Indicator Component
 */
interface HealthIndicatorProps {
  label: string;
  status: "healthy" | "degraded" | "unhealthy";
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({ label, status }) => {
  const statusColors: Record<string, string> = {
    healthy: "#10b981",
    degraded: "#f59e0b",
    unhealthy: "#ef4444"
  };

  return (
    <div className="health-indicator">
      <span className="health-label">{label}</span>
      <div
        className="health-dot"
        style={{ backgroundColor: statusColors[status] }}
        title={status}
      />
    </div>
  );
};

export default Dashboard;
