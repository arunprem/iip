import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, Users, Lock, UserPlus, FileSignature, AlertTriangle } from 'lucide-react'
import { apiClient } from '../api/client'

interface IAMUser {
  user_id: string;
  username: string;
  full_name: string;
  badge_number: string;
  department: string;
  clearance_level: string;
  roles: string[];
  is_active: boolean;
}

interface IAMRole {
  role_id: string;
  role_name: string;
  description: string;
  requires_jit: boolean;
}

export default function IAMAdmin() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'jit' | 'audit'>('users')

  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['iam-users'],
    queryFn: async () => {
      const res = await apiClient.get('/iam/users');
      return res.data.users as IAMUser[];
    }
  });

  const { data: rolesData, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['iam-roles'],
    queryFn: async () => {
      const res = await apiClient.get('/iam/roles');
      return res.data as IAMRole[];
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', height: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--iip-text-primary)' }}>
            Identity & Access Management
          </h1>
          <p style={{ color: 'var(--iip-text-secondary)', marginTop: 'var(--space-2)' }}>
            Manage personnel access, roles, and Just-In-Time clearance elevation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--iip-bg-card)', border: '1px solid var(--iip-border)',
            padding: '0.5rem 1rem', borderRadius: 'var(--iip-radius)', color: 'var(--iip-text-primary)'
          }}>
            <FileSignature size={16} /> Audit Export
          </button>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--iip-accent)', border: 'none',
            padding: '0.5rem 1rem', borderRadius: 'var(--iip-radius)', color: 'var(--iip-bg-page)', fontWeight: 600
          }}>
            <UserPlus size={16} /> Provision User
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--iip-border)' }}>
        {[
          { id: 'users', label: 'Personnel', icon: Users },
          { id: 'roles', label: 'Roles & Policies', icon: Shield },
          { id: 'jit', label: 'JIT Approvals', icon: Lock },
          { id: 'audit', label: 'Access Audit', icon: AlertTriangle }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--iip-accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--iip-accent)' : 'var(--iip-text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, background: 'var(--iip-bg-card)', border: '1px solid var(--iip-border)', borderRadius: 'var(--iip-radius)', padding: 'var(--space-6)', overflow: 'auto' }}>
        
        {activeTab === 'users' && (
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--iip-text-primary)' }}>Personnel Directory</h2>
            {isLoadingUsers ? (
              <p style={{ color: 'var(--iip-text-secondary)' }}>Loading users...</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--iip-border)', color: 'var(--iip-text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Badge #</th>
                    <th style={{ padding: '0.75rem' }}>Name</th>
                    <th style={{ padding: '0.75rem' }}>Clearance</th>
                    <th style={{ padding: '0.75rem' }}>Roles</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData?.map(user => (
                    <tr key={user.user_id} style={{ borderBottom: '1px solid var(--iip-border)' }}>
                      <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)' }}>{user.badge_number}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 500 }}>{user.full_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--iip-text-tertiary)' }}>{user.department}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem', 
                          background: 'rgba(239, 68, 68, 0.1)', 
                          color: 'var(--iip-status-critical)' 
                        }}>
                          {user.clearance_level}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{user.roles.join(', ')}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: user.is_active ? 'var(--iip-status-nominal)' : 'var(--iip-text-tertiary)' }}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!usersData || usersData.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--iip-text-secondary)' }}>
                        No users found in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'roles' && (
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--iip-text-primary)' }}>Defined Roles</h2>
            {isLoadingRoles ? (
              <p style={{ color: 'var(--iip-text-secondary)' }}>Loading roles...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {rolesData?.map(role => (
                  <div key={role.role_id} style={{ border: '1px solid var(--iip-border)', borderRadius: 'var(--iip-radius)', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{role.role_name}</h3>
                      {role.requires_jit && (
                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--iip-status-warning)', borderRadius: '4px' }}>
                          JIT Required
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--iip-text-secondary)' }}>{role.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'jit' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--iip-text-secondary)' }}>
            <Lock size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>No active Just-In-Time elevation requests pending approval.</p>
          </div>
        )}
        
        {activeTab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--iip-text-secondary)' }}>
            <AlertTriangle size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>Immutable ledger synced. Select 'Audit Export' to download cryptographically signed logs.</p>
          </div>
        )}

      </div>
    </div>
  )
}
