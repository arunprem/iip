import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { getMasterSuspectProfile } from '../../api/suspectDossiers';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import {
  SuspectMasterReport,
  type MasterProfileData,
} from '../../components/suspects/report/SuspectMasterReport';

interface ProfileReturnState {
  returnTo?: string;
  returnLabel?: string;
}

export default function SuspectMasterProfile() {
  const { masterId } = useParams<{ masterId: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navState = location.state as ProfileReturnState | null;
  const fromKgCanvas = searchParams.get('from') === 'kg-canvas';
  const returnTo = navState?.returnTo ?? (fromKgCanvas ? '/kg-canvas' : '/suspects');
  const returnLabel =
    navState?.returnLabel ?? (fromKgCanvas ? 'Back to network analysis' : 'Back to list');

  const [profile, setProfile] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!masterId) return;
    let cancelled = false;
    void getMasterSuspectProfile(masterId)
      .then((data) => {
        if (!cancelled) {
          setProfile({
            master_suspect_id: String(data.master_suspect_id),
            display_name: String(data.display_name),
            dossier_count: Number(data.dossier_count),
            identities: (data.identities as Record<string, unknown>[]) ?? [],
            addresses: (data.addresses as Record<string, unknown>[]) ?? [],
            contacts: (data.contacts as Record<string, unknown>[]) ?? [],
            social_accounts: (data.social_accounts as Record<string, unknown>[]) ?? [],
            relatives: (data.relatives as Record<string, unknown>[]) ?? [],
            photos: (data.photos as Record<string, unknown>[]) ?? [],
            fingerprints: (data.fingerprints as Record<string, unknown>[]) ?? [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [masterId]);

  return (
    <AdminPageLayout
      title="Suspect profile"
      description="Consolidated watch-list record across all linked unit dossiers."
      icon={Users}
      actions={
        <Link to={returnTo} className="btn-ghost btn btn-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={16} />
          {returnLabel}
        </Link>
      }
    >
      {loading && <p className="text-sm text-iip-text-muted">Loading…</p>}
      {!loading && !profile && (
        <p className="text-sm text-red-600">Suspect profile not found or access denied.</p>
      )}
      {!loading && profile && (
        <div className="suspect-report-wrap">
          <p className="suspect-report-wrap__hint mb-4">
            This suspect profile consolidates {profile.dossier_count} unit dossier
            {profile.dossier_count === 1 ? '' : 's'} — identities, addresses, contacts, photos, and
            associates from each linked submission.
          </p>
          <SuspectMasterReport profile={profile} />
        </div>
      )}
    </AdminPageLayout>
  );
}
