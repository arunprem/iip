import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSearch, Pencil } from 'lucide-react';
import { getSuspectDossierDetail } from '../../api/suspectDossiers';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import {
  SuspectDossierReportView,
  type DossierReportDetail,
} from '../../components/suspects/report/SuspectDossierReportView';

export default function SuspectDossierDetail() {
  const { dossierId } = useParams<{ dossierId: string }>();
  const [detail, setDetail] = useState<DossierReportDetail | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canViewMaster, setCanViewMaster] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dossierId) return;
    let cancelled = false;
    void getSuspectDossierDetail(dossierId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data as unknown as DossierReportDetail);
          setCanEdit(Boolean(data.can_edit));
          setCanViewMaster(Boolean(data.can_view_master));
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierId]);

  const identity = detail?.identity;

  return (
    <AdminPageLayout
      title="Unit dossier"
      description="Submitted intelligence record for this office."
      icon={FileSearch}
      actions={
        <div className="flex flex-wrap gap-2">
          {canEdit && dossierId && (
            <Link
              to={`/suspects/${dossierId}/edit`}
              className="btn-primary btn btn-sm inline-flex items-center gap-1.5"
            >
              <Pencil size={16} />
              Edit dossier
            </Link>
          )}
          {canViewMaster && detail && (
            <Link
              to={`/suspects/masters/${detail.master_suspect_id}`}
              className="btn-secondary btn btn-sm inline-flex items-center gap-1.5"
            >
              Master profile
            </Link>
          )}
          <Link to="/suspects" className="btn-ghost btn btn-sm inline-flex items-center gap-1.5">
            <ArrowLeft size={16} />
            Back to list
          </Link>
        </div>
      }
    >
      {loading && <p className="text-sm text-iip-text-muted">Loading…</p>}
      {!loading && !detail && (
        <p className="text-sm text-red-600">Dossier not found or access denied.</p>
      )}
      {!loading && detail && (
        <div className="suspect-report-wrap">
          <SuspectDossierReportView
            detail={detail}
            editHref={canEdit && dossierId ? `/suspects/${dossierId}/edit` : undefined}
          />
        </div>
      )}
      {!loading && detail && identity && (
        <p className="mt-4 text-xs text-iip-text-muted font-sans">
          Subject: {String(identity.criminal_name)} · {detail.office_name ?? 'Unit'} ·{' '}
          {detail.link_status}
        </p>
      )}
    </AdminPageLayout>
  );
}
