import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  Filter,
  MapPin,
  MoreHorizontal,
} from 'lucide-react';

const monthlySales = [
  { month: 'Jan', value: 168 },
  { month: 'Feb', value: 385 },
  { month: 'Mar', value: 201 },
  { month: 'Apr', value: 298 },
  { month: 'May', value: 245 },
  { month: 'Jun', value: 312 },
  { month: 'Jul', value: 180 },
  { month: 'Aug', value: 290 },
  { month: 'Sep', value: 220 },
  { month: 'Oct', value: 350 },
  { month: 'Nov', value: 280 },
  { month: 'Dec', value: 190 },
];

const statisticsData = [
  { name: 'Mon', value: 12 },
  { name: 'Tue', value: 18 },
  { name: 'Wed', value: 15 },
  { name: 'Thu', value: 22 },
  { name: 'Fri', value: 28 },
  { name: 'Sat', value: 20 },
  { name: 'Sun', value: 24 },
  { name: 'Mon', value: 30 },
  { name: 'Tue', value: 26 },
  { name: 'Wed', value: 32 },
  { name: 'Thu', value: 38 },
  { name: 'Fri', value: 35 },
];

const recentOrders = [
  {
    id: 1,
    name: 'Operation Coastal Watch',
    category: 'Surveillance',
    price: 'Priority A',
    status: 'Active',
    statusColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 2,
    name: 'District Intel Brief #442',
    category: 'Report',
    price: 'Priority B',
    status: 'Review',
    statusColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 3,
    name: 'Cross-border Alert Chain',
    category: 'Alert',
    price: 'Critical',
    status: 'Escalated',
    statusColor: 'bg-red-100 text-red-700',
  },
  {
    id: 4,
    name: 'HUMINT Source Validation',
    category: 'HUMINT',
    price: 'Priority B',
    status: 'Active',
    statusColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 5,
    name: 'Weekly Ops Summary',
    category: 'Report',
    price: 'Routine',
    status: 'Closed',
    statusColor: 'bg-slate-100 text-slate-600',
  },
];

const stats = [
  {
    label: 'Active Cases',
    value: '247',
    change: '11.01%',
    up: true,
    icon: Users,
    iconBg: 'bg-blue-50 text-iip-primary',
  },
  {
    label: 'Open Alerts',
    value: '18',
    change: '3 critical',
    up: false,
    icon: AlertTriangle,
    iconBg: 'bg-amber-50 text-amber-600',
  },
  {
    label: 'Analysts On Shift',
    value: '34',
    change: '9.05%',
    up: true,
    icon: TrendingUp,
    iconBg: 'bg-emerald-50 text-emerald-600',
  },
  {
    label: 'Reports Generated',
    value: '89',
    change: '4.35%',
    up: false,
    icon: FileText,
    iconBg: 'bg-violet-50 text-violet-600',
  },
];

function StatCard({
  label,
  value,
  change,
  up,
  icon: Icon,
  iconBg,
}: (typeof stats)[0]) {
  return (
    <div className="dashboard-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon size={20} />
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            up ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {change}
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </span>
      </div>
      <p className="text-sm text-iip-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-iip-text tracking-tight">{value}</p>
    </div>
  );
}

export default function DirectorDashboard() {
  const [statsTab, setStatsTab] = useState<'Overview' | 'Cases' | 'Alerts'>('Overview');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-iip-text">Dashboard</h1>
        <p className="text-sm text-iip-text-muted mt-1">
          Operational overview — IIP, Kerala Police
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="dashboard-card p-5 md:p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-iip-text">Monthly Target</p>
              <p className="text-xs text-iip-text-muted mt-0.5">Case clearance goal</p>
            </div>
            <button type="button" className="text-iip-text-muted hover:text-iip-text p-1">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="flex flex-col items-center py-4">
            <div className="relative h-32 w-32">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="rgb(var(--color-iip-border))"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="rgb(var(--color-iip-primary))"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52 * 0.7555} ${2 * Math.PI * 52}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-iip-text">75.55%</span>
                <span className="text-xs text-emerald-600 font-medium">+10%</span>
              </div>
            </div>
            <p className="text-xs text-iip-text-muted text-center mt-3 px-2">
              You closed 247 cases this month. Keep up the good work!
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-iip-border text-center">
            <div>
              <p className="text-[10px] text-iip-text-muted uppercase">Target</p>
              <p className="text-sm font-semibold text-iip-text flex items-center justify-center gap-0.5">
                320 <TrendingDown size={12} className="text-red-500" />
              </p>
            </div>
            <div>
              <p className="text-[10px] text-iip-text-muted uppercase">Closed</p>
              <p className="text-sm font-semibold text-iip-text flex items-center justify-center gap-0.5">
                247 <TrendingUp size={12} className="text-emerald-600" />
              </p>
            </div>
            <div>
              <p className="text-[10px] text-iip-text-muted uppercase">Today</p>
              <p className="text-sm font-semibold text-iip-text flex items-center justify-center gap-0.5">
                12 <TrendingUp size={12} className="text-emerald-600" />
              </p>
            </div>
          </div>
        </div>

        <div className="dashboard-card p-5 md:p-6 lg:col-span-2 flex items-center">
          <div className="flex flex-wrap gap-6 w-full justify-around py-2">
            <div className="text-center">
              <p className="text-3xl font-bold text-iip-primary">18</p>
              <p className="text-xs text-iip-text-muted mt-1">Critical alerts</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-iip-text">94%</p>
              <p className="text-xs text-iip-text-muted mt-1">System uptime</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">ONLINE</p>
              <p className="text-xs text-iip-text-muted mt-1">Node status</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
        <div className="dashboard-card p-5 md:p-6 xl:col-span-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-base font-semibold text-iip-text">Monthly Activity</p>
              <p className="text-xs text-iip-text-muted">Cases opened per month</p>
            </div>
            <button type="button" className="text-iip-text-muted hover:text-iip-text p-1">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySales} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar dataKey="value" fill="rgb(var(--color-iip-primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-card p-5 md:p-6 xl:col-span-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-base font-semibold text-iip-text">Statistics</p>
              <p className="text-xs text-iip-text-muted">Activity trend across the wing</p>
            </div>
            <div className="flex items-center gap-2">
              {(['Overview', 'Cases', 'Alerts'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatsTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statsTab === tab
                      ? 'bg-iip-primary text-white'
                      : 'text-iip-text-muted hover:bg-iip-surface-hover'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statisticsData}>
                <defs>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--color-iip-primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="rgb(var(--color-iip-primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="rgb(var(--color-iip-primary))"
                  strokeWidth={2}
                  fill="url(#colorActivity)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
        <div className="dashboard-card p-5 md:p-6 xl:col-span-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-semibold text-iip-text">Regional Activity</p>
              <p className="text-xs text-iip-text-muted">Kerala districts — active cases</p>
            </div>
            <button type="button" className="text-iip-text-muted hover:text-iip-text p-1">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="h-48 rounded-xl bg-gradient-to-br from-iip-primary/5 to-iip-primary/10 border border-iip-border flex items-center justify-center">
            <div className="text-center px-6">
              <MapPin className="mx-auto text-iip-primary mb-2" size={32} />
              <p className="text-sm font-medium text-iip-text">Geospatial module</p>
              <p className="text-xs text-iip-text-muted mt-1">Connect hotspot-svc for live map</p>
            </div>
          </div>
        </div>

        <div className="dashboard-card p-5 md:p-6 xl:col-span-7 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-semibold text-iip-text">Recent Operations</p>
              <p className="text-xs text-iip-text-muted">Latest case and alert activity</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-iip-border text-xs font-medium text-iip-text-muted hover:bg-iip-surface-hover"
              >
                <Filter size={14} />
                Filter
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-iip-primary hover:text-iip-primary-hover"
              >
                See all
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-iip-border text-left">
                  <th className="pb-3 px-2 font-medium text-iip-text-muted">Operation</th>
                  <th className="pb-3 px-2 font-medium text-iip-text-muted">Type</th>
                  <th className="pb-3 px-2 font-medium text-iip-text-muted">Priority</th>
                  <th className="pb-3 px-2 font-medium text-iip-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((row) => (
                  <tr key={row.id} className="border-b border-iip-border/80 last:border-0">
                    <td className="py-3.5 px-2">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-iip-primary/10 flex items-center justify-center text-iip-primary text-xs font-bold">
                          {row.id}
                        </div>
                        <span className="font-medium text-iip-text">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-2 text-iip-text-muted">{row.category}</td>
                    <td className="py-3.5 px-2 text-iip-text">{row.price}</td>
                    <td className="py-3.5 px-2">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${row.statusColor}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
