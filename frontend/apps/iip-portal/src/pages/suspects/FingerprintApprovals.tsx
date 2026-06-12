import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Fingerprint, RefreshCw, X } from 'lucide-react';
import {
  approveFingerprintSubmission,
  listFingerprintSubmissions,
  rejectFingerprintSubmission,
  type FingerprintSubmission,
} from '../../api/fingerprintSubmissions';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { SubmissionImagePreview } from '../../components/suspects/SubmissionImagePreview';

function formatFinger(position: string) {
  return position
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FingerprintApprovals() {
  const [items, setItems] = useState<FingerprintSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    void listFingerprintSubmissions({ status: 'PENDING', pageSize: 100 })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await approveFingerprintSubmission(id, notes[id]);
      load();
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    try {
      await rejectFingerprintSubmission(id, notes[id]);
      load();
    } finally {
      setActingId(null);
    }
  };

  return (
    <AdminPageLayout
      title="Fingerprint approvals"
      description="Review fingerprints captured on mobile and submitted for supervisor approval."
      icon={Fingerprint}
      actions={

        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <div className="dashboard-card p-8 text-iip-text-muted text-sm">Loading pending submissions…</div>
      ) : items.length === 0 ? (
        <div className="dashboard-card p-10 text-center">
          <Fingerprint className="mx-auto mb-3 text-iip-text-muted" size={40} />
          <p className="text-iip-text font-medium">No pending fingerprints</p>
          <p className="text-iip-text-muted text-sm mt-1">
            Field officers can tag prints from the mobile app under Field face recognition → Tag fingerprint to suspect.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-iip-text-muted">{total} pending submission{total === 1 ? '' : 's'}</p>
          {items.map((item) => (
            <article key={item.id} className="dashboard-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <SubmissionImagePreview
                    submissionId={item.id}
                    altText={formatFinger(item.fingerPosition)}
                    className="w-14 h-18 object-cover rounded border border-iip-border bg-iip-bg shrink-0 mt-1"
                    iconSize={28}
                  />
                  <div>
                    <h2 className="text-lg font-semibold text-iip-text">{item.criminalName}</h2>
                    <p className="text-sm text-iip-text-muted mt-1">
                      {formatFinger(item.fingerPosition)} · {item.source} · {item.officeName ?? 'Office'}
                    </p>
                    <p className="text-xs text-iip-text-muted mt-2">
                      Captured {formatWhen(item.capturedAt)}
                      {item.deviceModel ? ` · ${item.deviceModel}` : ''}
                      {item.qualityScore != null ? ` · Quality ${Math.round(item.qualityScore * 100)}%` : ''}
                    </p>
                    <Link
                      to={`/suspects/${item.dossierId}`}
                      className="text-sm text-iip-primary hover:underline mt-2 inline-block"
                    >
                      View dossier
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-[220px]">
                  <textarea
                    className="input text-sm min-h-[72px]"
                    placeholder="Review notes (optional)"
                    value={notes[item.id] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      disabled={actingId === item.id}
                      onClick={() => void handleApprove(item.id)}
                    >
                      <Check size={16} />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-1"
                      disabled={actingId === item.id}
                      onClick={() => void handleReject(item.id)}
                    >
                      <X size={16} />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminPageLayout>
  );
}
