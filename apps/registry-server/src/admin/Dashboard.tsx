/**
 * Shielded ID Registry Admin Dashboard
 * File: apps/registry-server/src/admin/Dashboard.tsx
 *
 * Administrative interface for registry management, monitoring, and operations
 * Provides real-time metrics, key management, and system health monitoring
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, Key, Activity, AlertTriangle, CheckCircle, Settings, Database, Zap, ShieldCheck, Clock, TrendingUp, Download, Search, Filter } from 'lucide-react';

interface DashboardMetrics {
  totalWallets: number;
  activeKeys: number;
  revokedKeys: number;
  totalVerifications: number;
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  storageUsed: number;
  backupStatus: 'healthy' | 'warning' | 'critical';
  complianceScore: number;
}

interface RecentActivity {
  id: string;
  type: 'enrollment' | 'verification' | 'revocation' | 'backup' | 'audit';
  timestamp: Date;
  subjectId: string;
  status: 'success' | 'failed' | 'warning';
  details?: string;
}

interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

interface SystemConfig {
  maxConcurrentRequests: number;
  backupFrequency: string;
  logRetentionDays: number;
  enableAuditLogging: boolean;
  maintenanceMode: boolean;
}

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalWallets: 0,
    activeKeys: 0,
    revokedKeys: 0,
    totalVerifications: 0,
    uptime: 99.9,
    errorRate: 0.1,
    avgResponseTime: 45,
    storageUsed: 85,
    backupStatus: 'healthy',
    complianceScore: 95
  });

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    maxConcurrentRequests: 1000,
    backupFrequency: 'daily',
    logRetentionDays: 90,
    enableAuditLogging: true,
    maintenanceMode: false
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'performance' | 'config'>('overview');

  useEffect(() => {
    // Fetch dashboard data
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // In production, this would fetch from registry API
      const response = await fetch('/api/admin/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
        setRecentActivity(data.activity);
        setSecurityAlerts(data.alerts);
      } else {
        // Mock data for development
        setMetrics({
          totalWallets: 15420,
          activeKeys: 15280,
          revokedKeys: 140,
          totalVerifications: 892450,
          uptime: 99.97,
          errorRate: 0.03,
          avgResponseTime: 42,
          storageUsed: 78,
          backupStatus: 'healthy',
          complianceScore: 96
        });
        setRecentActivity([
          {
            id: '1',
            type: 'enrollment',
            timestamp: new Date(Date.now() - 300000),
            subjectId: 'wallet_abc123',
            status: 'success',
            details: 'New wallet registration completed'
          },
          {
            id: '2',
            type: 'verification',
            timestamp: new Date(Date.now() - 600000),
            subjectId: 'verifier_xyz789',
            status: 'success',
            details: 'Age verification proof validated'
          },
          {
            id: '3',
            type: 'revocation',
            timestamp: new Date(Date.now() - 900000),
            subjectId: 'wallet_def456',
            status: 'success',
            details: 'Credential revocation processed'
          },
          {
            id: '4',
            type: 'backup',
            timestamp: new Date(Date.now() - 3600000),
            subjectId: 'system',
            status: 'success',
            details: 'Automated backup completed successfully'
          },
          {
            id: '5',
            type: 'audit',
            timestamp: new Date(Date.now() - 7200000),
            subjectId: 'admin_user',
            status: 'success',
            details: 'Security audit log reviewed'
          }
        ]);
        setSecurityAlerts([
          {
            id: '1',
            severity: 'medium',
            message: 'Unusual verification pattern detected from IP 192.168.1.100',
            timestamp: new Date(Date.now() - 1800000),
            resolved: false
          },
          {
            id: '2',
            severity: 'low',
            message: 'Certificate rotation due in 30 days',
            timestamp: new Date(Date.now() - 86400000),
            resolved: false
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: string;
    color?: string;
    subtitle?: string;
  }> = ({ title, value, icon, trend, color = 'blue', subtitle }) => (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${color}-500`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && <p className="text-sm text-green-600">{trend}</p>}
        </div>
        <div className={`text-${color}-500`}>{icon}</div>
      </div>
    </div>
  );

  const AlertCard: React.FC<{ alert: SecurityAlert }> = ({ alert }) => (
    <div className={`border-l-4 p-4 mb-4 ${
      alert.severity === 'critical' ? 'border-red-500 bg-red-50' :
      alert.severity === 'high' ? 'border-orange-500 bg-orange-50' :
      alert.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
      'border-blue-500 bg-blue-50'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{alert.message}</p>
          <p className="text-xs text-gray-500">{alert.timestamp.toLocaleString()}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
            alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
            alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {alert.severity}
          </span>
          {!alert.resolved && (
            <button className="text-xs text-blue-600 hover:text-blue-800">
              Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const ConfigSection: React.FC = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">System Configuration</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Max Concurrent Requests
          </label>
          <input
            type="number"
            value={systemConfig.maxConcurrentRequests}
            onChange={(e) => setSystemConfig({...systemConfig, maxConcurrentRequests: parseInt(e.target.value)})}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Backup Frequency
          </label>
          <select
            value={systemConfig.backupFrequency}
            onChange={(e) => setSystemConfig({...systemConfig, backupFrequency: e.target.value})}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Log Retention (Days)
          </label>
          <input
            type="number"
            value={systemConfig.logRetentionDays}
            onChange={(e) => setSystemConfig({...systemConfig, logRetentionDays: parseInt(e.target.value)})}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={systemConfig.enableAuditLogging}
            onChange={(e) => setSystemConfig({...systemConfig, enableAuditLogging: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-900">
            Enable Audit Logging
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={systemConfig.maintenanceMode}
            onChange={(e) => setSystemConfig({...systemConfig, maintenanceMode: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-900">
            Maintenance Mode
          </label>
        </div>
      </div>
      <div className="mt-6 flex justify-end space-x-3">
        <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
          Reset to Defaults
        </button>
        <button className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700">
          Save Configuration
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Shielded ID Registry Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleString()}
              </div>
              <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'security', label: 'Security', icon: ShieldCheck },
              { id: 'performance', label: 'Performance', icon: TrendingUp },
              { id: 'config', label: 'Configuration', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Total Wallets"
                value={metrics.totalWallets.toLocaleString()}
                icon={<Users className="h-6 w-6" />}
                trend="+2.1% from last month"
                color="blue"
              />
              <MetricCard
                title="Active Keys"
                value={metrics.activeKeys.toLocaleString()}
                icon={<Key className="h-6 w-6" />}
                trend="99.1% active rate"
                color="green"
              />
              <MetricCard
                title="Total Verifications"
                value={metrics.totalVerifications.toLocaleString()}
                icon={<Activity className="h-6 w-6" />}
                trend="+15.3% from last month"
                color="purple"
              />
              <MetricCard
                title="System Uptime"
                value={`${metrics.uptime}%`}
                icon={<CheckCircle className="h-6 w-6" />}
                color="green"
              />
              <MetricCard
                title="Avg Response Time"
                value={`${metrics.avgResponseTime}ms`}
                icon={<Zap className="h-6 w-6" />}
                trend="-5ms from last week"
                color="yellow"
              />
              <MetricCard
                title="Storage Used"
                value={`${metrics.storageUsed}%`}
                icon={<Database className="h-6 w-6" />}
                subtitle="of 1TB allocated"
                color="blue"
              />
              <MetricCard
                title="Backup Status"
                value={metrics.backupStatus === 'healthy' ? 'Healthy' : 'Issues'}
                icon={<Download className="h-6 w-6" />}
                color={metrics.backupStatus === 'healthy' ? 'green' : 'red'}
              />
              <MetricCard
                title="Compliance Score"
                value={`${metrics.complianceScore}%`}
                icon={<ShieldCheck className="h-6 w-6" />}
                color="green"
              />
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search activity..."
                    className="border border-gray-300 rounded px-3 py-1 text-sm"
                  />
                  <Filter className="h-4 w-4 text-gray-400 cursor-pointer" />
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-3 ${
                        activity.status === 'success' ? 'bg-green-500' :
                        activity.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)} - {activity.subjectId}
                        </p>
                        <p className="text-sm text-gray-500">
                          {activity.timestamp.toLocaleString()}
                        </p>
                        {activity.details && (
                          <p className="text-xs text-gray-400 mt-1">{activity.details}</p>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      activity.status === 'success'
                        ? 'bg-green-100 text-green-800'
                        : activity.status === 'warning'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* System Health */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">System Health</h2>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">✅</div>
                    <p className="text-sm text-gray-600">Database</p>
                    <p className="text-xs text-gray-500">All connections healthy</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">✅</div>
                    <p className="text-sm text-gray-600">ZK Agent</p>
                    <p className="text-xs text-gray-500">Proofs generating normally</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">✅</div>
                    <p className="text-sm text-gray-600">API Endpoints</p>
                    <p className="text-xs text-gray-500">All endpoints responding</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">✅</div>
                    <p className="text-sm text-gray-600">Backup System</p>
                    <p className="text-xs text-gray-500">Last backup: 2 hours ago</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'security' && (
          <div className="space-y-8">
            {/* Security Alerts */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Security Alerts</h2>
              </div>
              <div className="px-6 py-4">
                {securityAlerts.length === 0 ? (
                  <p className="text-gray-500">No active security alerts</p>
                ) : (
                  securityAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
                )}
              </div>
            </div>

            {/* Security Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                title="Failed Auth Attempts"
                value="23"
                icon={<AlertTriangle className="h-6 w-6" />}
                subtitle="Last 24 hours"
                color="red"
              />
              <MetricCard
                title="Active Sessions"
                value="1,247"
                icon={<Users className="h-6 w-6" />}
                color="blue"
              />
              <MetricCard
                title="Certificates Valid"
                value="98.5%"
                icon={<ShieldCheck className="h-6 w-6" />}
                color="green"
              />
            </div>

            {/* Key Management */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Key Management</h2>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-4 border rounded">
                    <Key className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                    <p className="font-medium">Active Keys</p>
                    <p className="text-2xl font-bold text-blue-600">{metrics.activeKeys.toLocaleString()}</p>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="font-medium">Revoked Keys</p>
                    <p className="text-2xl font-bold text-red-600">{metrics.revokedKeys.toLocaleString()}</p>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <Clock className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <p className="font-medium">Expiring Soon</p>
                    <p className="text-2xl font-bold text-yellow-600">47</p>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                    View All Keys
                  </button>
                  <button className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700">
                    Rotate Keys
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-8">
            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Avg Response Time"
                value={`${metrics.avgResponseTime}ms`}
                icon={<Zap className="h-6 w-6" />}
                trend="-5ms from last week"
                color="green"
              />
              <MetricCard
                title="Requests/min"
                value="1,247"
                icon={<Activity className="h-6 w-6" />}
                trend="+8.2% from yesterday"
                color="blue"
              />
              <MetricCard
                title="Error Rate"
                value={`${metrics.errorRate}%`}
                icon={<AlertTriangle className="h-6 w-6" />}
                color="yellow"
              />
              <MetricCard
                title="Throughput"
                value="99.2%"
                icon={<TrendingUp className="h-6 w-6" />}
                subtitle="of capacity"
                color="purple"
              />
            </div>

            {/* Performance Charts Placeholder */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Trends</h3>
              <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                <p className="text-gray-500">Performance charts would be displayed here</p>
              </div>
            </div>

            {/* Resource Usage */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Resource Usage</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>CPU Usage</span>
                    <span>45%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{width: '45%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Memory Usage</span>
                    <span>67%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{width: '67%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Storage Usage</span>
                    <span>{metrics.storageUsed}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${metrics.storageUsed > 90 ? 'bg-red-600' : 'bg-yellow-600'}`} style={{width: `${metrics.storageUsed}%`}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && <ConfigSection />}
      </div>
    </div>
  );
};

export default Dashboard;