import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, FilePlus2, Loader2, Search, UserCheck, FileText, Image as ImageIcon, Mic } from 'lucide-react';
import { AddressLocationPicker } from '../components/suspects/AddressLocationPicker';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { AdminSectionCard } from '../components/admin/AdminSectionCard';
import { AdminButton } from '../components/admin/AdminButton';
import { assistantDraftHumintReport } from '../api/assistant';
import {
  createHumintReport,
  listHumintReports,
  searchHumintReportsSemantic,
  uploadHumintAttachment,
  type HumintReport,
  type HumintSemanticSearchHit,
  type HumintReportType,
} from '../api/humintReports';
import { renderAssistantMarkdown } from '../utils/renderAssistantMarkdown';
import { showToast } from '../stores/toastStore';

const REPORT_TYPES: HumintReportType[] = [
  'TIP',
  'EVENT',
  'FIELD_OBSERVATION',
  'INTELLIGENCE_REPORT',
  'FOLLOW_UP',
];

const URGENCY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function HumintVault() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<HumintReportType>('TIP');
  const [narrative, setNarrative] = useState('');
  const [eventAt, setEventAt] = useState('');
  const [locationText, setLocationText] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [urgency, setUrgency] = useState('MEDIUM');
  const [crossUnitVisible, setCrossUnitVisible] = useState(false);
  const [linkedSuspectDossierId, setLinkedSuspectDossierId] = useState('');
  const [linkedCaseRef, setLinkedCaseRef] = useState('');
  const [linkedHotspotLabel, setLinkedHotspotLabel] = useState('');
  const [linkedGraphNodeId, setLinkedGraphNodeId] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftStructured, setDraftStructured] = useState('');
  const [draftEntities, setDraftEntities] = useState<Record<string, unknown> | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);

  const reportQuery = useQuery({
    queryKey: ['humint-reports', activeSearch, reportTypeFilter, statusFilter],
    queryFn: () =>
      listHumintReports({
        q: activeSearch || undefined,
        reportType: reportTypeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const semanticQuery = useQuery({
    queryKey: ['humint-reports-semantic', activeSearch],
    queryFn: () => searchHumintReportsSemantic({ query: activeSearch, size: 12 }),
    enabled: activeSearch.trim().length >= 3,
  });

  const draftAssistMutation = useMutation({
    mutationFn: () =>
      assistantDraftHumintReport({
        narrative,
        location_text: locationText || undefined,
        report_type: reportType,
      }),
    onSuccess: (data) => {
      if (!title.trim()) setTitle(data.title);
      setDraftSummary(data.summary);
      setDraftStructured(data.structured_report);
      setDraftEntities(data.entities ?? null);
      setReportType(data.report_type);
      setUrgency(data.urgency);
      showToast('success', 'LLM prepared a HUMINT draft suggestion.');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createHumintReport({
        title,
        reportType,
        narrative,
        eventAt,
        locationText,
        latitude,
        longitude,
        urgency,
        supervisorCrossUnitVisible: crossUnitVisible,
        linkedSuspectDossierId: linkedSuspectDossierId.trim() || undefined,
        linkedCaseRef,
        linkedHotspotLabel,
        linkedGraphNodeId,
        llmSummary: draftSummary,
        llmStructuredReport: draftStructured,
        llmEntities: draftEntities,
        searchText: [title, narrative, draftSummary, JSON.stringify(draftEntities ?? {})].join('\n'),
        status: 'SUBMITTED',
      });

      for (const file of photoFiles) {
        await uploadHumintAttachment({ reportId: created.id, attachmentType: 'PHOTO', file });
      }
      for (const file of audioFiles) {
        await uploadHumintAttachment({ reportId: created.id, attachmentType: 'AUDIO', file });
      }
      for (const file of documentFiles) {
        await uploadHumintAttachment({ reportId: created.id, attachmentType: 'DOCUMENT', file });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['humint-reports'] });
      setTitle('');
      setNarrative('');
      setEventAt('');
      setLocationText('');
      setLatitude('');
      setLongitude('');
      setUrgency('MEDIUM');
      setCrossUnitVisible(false);
      setLinkedSuspectDossierId('');
      setLinkedCaseRef('');
      setLinkedHotspotLabel('');
      setLinkedGraphNodeId('');
      setDraftSummary('');
      setDraftStructured('');
      setDraftEntities(null);
      setPhotoFiles([]);
      setAudioFiles([]);
      setDocumentFiles([]);
      showToast('success', 'HUMINT report submitted.');
    },
  });

  const entityPreview = useMemo(() => {
    if (!draftEntities) return [] as string[];
    const out: string[] = [];
    for (const [key, value] of Object.entries(draftEntities)) {
      if (Array.isArray(value) && value.length > 0) {
        out.push(`${key}: ${value.join(', ')}`);
      }
    }
    return out;
  }, [draftEntities]);

  return (
    <AdminPageLayout
      title="Source (HUMINT) Vault"
      description="Field intelligence intake for tips, events, observations, and HUMINT reports with assistive drafting and searchable report memory."
      icon={UserCheck}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="space-y-5">
          <AdminSectionCard
            title="Submit Field Intelligence"
            description="Capture raw field input first, then use assistive AI to structure it before final submission."
          >
            <div className="p-5 md:p-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Report Title</label>
                  <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short intelligence subject" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Report Type</label>
                  <select className="form-control" value={reportType} onChange={(e) => setReportType(e.target.value as HumintReportType)}>
                    {REPORT_TYPES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Raw Narrative</label>
                <textarea
                  className="form-control min-h-[14rem]"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Enter the field tip, event note, intelligence report, or rough observation exactly as received."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Event Time</label>
                  <input type="datetime-local" className="form-control" value={eventAt} onChange={(e) => setEventAt(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Urgency</label>
                  <select className="form-control" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    {URGENCY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-iip-border bg-iip-bg/40 p-4">
                <AddressLocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  mapId="humint-vault-map"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Location Text</label>
                <input className="form-control" value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="Village, landmark, route, meeting point" />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Linked Suspect Dossier ID</label>
                  <input className="form-control" value={linkedSuspectDossierId} onChange={(e) => setLinkedSuspectDossierId(e.target.value)} placeholder="Optional UUID" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Linked Case Ref</label>
                  <input className="form-control" value={linkedCaseRef} onChange={(e) => setLinkedCaseRef(e.target.value)} placeholder="Crime / FIR / case ref" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Hotspot Label</label>
                  <input className="form-control" value={linkedHotspotLabel} onChange={(e) => setLinkedHotspotLabel(e.target.value)} placeholder="Area / hotspot label" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">KG Node ID</label>
                  <input className="form-control" value={linkedGraphNodeId} onChange={(e) => setLinkedGraphNodeId(e.target.value)} placeholder="Optional graph node id" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-iip-text-muted">
                <input type="checkbox" checked={crossUnitVisible} onChange={(e) => setCrossUnitVisible(e.target.checked)} />
                Allow optional supervisor cross-unit visibility for this report.
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Photo Attachments</label>
                  <input type="file" multiple accept="image/*" className="form-control" onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Audio Attachments</label>
                  <input type="file" multiple accept="audio/*" className="form-control" onChange={(e) => setAudioFiles(Array.from(e.target.files ?? []))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Document Attachments</label>
                  <input type="file" multiple accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png" className="form-control" onChange={(e) => setDocumentFiles(Array.from(e.target.files ?? []))} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-iip-border bg-iip-bg/40 p-4">
                <AdminButton type="button" variant="secondary" onClick={() => draftAssistMutation.mutate()} disabled={draftAssistMutation.isPending || !narrative.trim()}>
                  {draftAssistMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
                  Assist with Draft
                </AdminButton>
                <AdminButton type="button" variant="primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title.trim() || !narrative.trim()}>
                  {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
                  Submit HUMINT Report
                </AdminButton>
              </div>
            </div>
          </AdminSectionCard>
        </div>

        <div className="space-y-5">
          <AdminSectionCard title="LLM Draft Assist" description="Assistive only. Analyst remains responsible for final wording and actionability.">
            <div className="p-5 md:p-6 space-y-4">
              {draftSummary ? (
                <>
                  <div className="rounded-2xl border border-iip-border bg-iip-bg/40 p-4 text-sm text-iip-text-muted">
                    <p className="text-xs font-semibold uppercase tracking-wide text-iip-text-muted mb-2">Summary</p>
                    <p>{draftSummary}</p>
                  </div>
                  <div className="rounded-2xl border border-iip-border bg-iip-bg/40 p-4 text-sm text-iip-text-muted">
                    {renderAssistantMarkdown(draftStructured)}
                  </div>
                  {entityPreview.length > 0 && (
                    <div className="rounded-2xl border border-iip-border bg-iip-bg/40 p-4 text-sm text-iip-text-muted space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-iip-text-muted">Extracted Entities</p>
                      {entityPreview.map((line) => <p key={line}>{line}</p>)}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-iip-text-muted">Use AI after entering the raw narrative to get a suggested title, summary, structured report, entities, urgency, and report type.</p>
              )}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Search Submitted Reports" description="Search stored HUMINT reports by text, type, and workflow status.">
            <div className="p-5 md:p-6 space-y-4">
              <div className="flex gap-2">
                <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search narrative, summary, location..." />
                <AdminButton type="button" variant="primary" onClick={() => setActiveSearch(search.trim())}>
                  <Search size={15} />
                  Search
                </AdminButton>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="form-control" value={reportTypeFilter} onChange={(e) => setReportTypeFilter(e.target.value)}>
                  <option value="">All report types</option>
                  {REPORT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="REVIEWED">REVIEWED</option>
                  <option value="ACTIONED">ACTIONED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div className="space-y-3">
                {reportQuery.isLoading ? (
                  <div className="rounded-2xl border border-iip-border bg-iip-bg/30 p-4 text-sm text-iip-text-muted">Loading HUMINT reports…</div>
                ) : activeSearch.trim().length >= 3 ? (
                  semanticQuery.isLoading ? (
                    <div className="rounded-2xl border border-iip-border bg-iip-bg/30 p-4 text-sm text-iip-text-muted">Running semantic search…</div>
                  ) : semanticQuery.data?.hits.length ? (
                    semanticQuery.data.hits.map((hit) => <HumintSemanticHitCard key={hit.report_id} hit={hit} />)
                  ) : (
                    <div className="rounded-2xl border border-dashed border-iip-border bg-iip-bg/25 p-4 text-sm text-iip-text-muted">No semantic HUMINT matches found for this query.</div>
                  )
                ) : reportQuery.data?.reports.length ? (
                  reportQuery.data.reports.map((report) => <HumintReportCard key={report.id} report={report} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-iip-border bg-iip-bg/25 p-4 text-sm text-iip-text-muted">No HUMINT reports found for the current filter.</div>
                )}
              </div>
            </div>
          </AdminSectionCard>
        </div>
      </div>
    </AdminPageLayout>
  );
}

function HumintReportCard({ report }: { report: HumintReport }) {
  return (
    <article className="rounded-2xl border border-iip-border bg-iip-bg/35 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-iip-text">{report.title}</h3>
          <p className="mt-1 text-xs text-iip-text-muted">{report.report_type} · {report.status} · {report.urgency || 'No urgency set'}</p>
        </div>
        <span className="rounded-full bg-iip-primary/10 px-2.5 py-1 text-[11px] font-medium text-iip-primary">
          {report.attachments.length} attachment{report.attachments.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-sm text-iip-text-muted line-clamp-4">{report.llm_summary || report.narrative}</p>
      <div className="flex flex-wrap gap-2 text-[11px] text-iip-text-muted">
        {report.location_text && <span className="rounded-full border border-iip-border px-2 py-1">{report.location_text}</span>}
        {report.linked_case_ref && <span className="rounded-full border border-iip-border px-2 py-1">Case: {report.linked_case_ref}</span>}
        {report.linked_hotspot_label && <span className="rounded-full border border-iip-border px-2 py-1">Hotspot: {report.linked_hotspot_label}</span>}
      </div>
      {report.attachments.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-iip-border pt-3">
          <p className="text-[11px] font-semibold text-iip-text-muted uppercase tracking-wider">Attachments & Intelligence</p>
          <div className="flex flex-col gap-2">
            {report.attachments.map((att) => (
              <div key={att.id} className="rounded-xl border border-iip-border bg-iip-bg/50 p-2.5 text-xs">
                <div className="flex items-center gap-2 font-medium text-iip-text mb-1.5">
                  {att.attachment_type === 'PHOTO' && <ImageIcon size={14} className="text-blue-500" />}
                  {att.attachment_type === 'AUDIO' && <Mic size={14} className="text-green-500" />}
                  {att.attachment_type === 'DOCUMENT' && <FileText size={14} className="text-orange-500" />}
                  <span className="truncate">{att.file_name}</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {att.vision_caption && (
                    <p className="text-iip-text-muted leading-relaxed"><strong className="text-iip-text">Vision AI:</strong> {att.vision_caption}</p>
                  )}
                  {att.audio_transcript && (
                    <p className="text-iip-text-muted leading-relaxed"><strong className="text-iip-text">Transcript:</strong> {att.audio_transcript}</p>
                  )}
                  {att.ocr_text && (
                    <p className="text-iip-text-muted leading-relaxed line-clamp-3"><strong className="text-iip-text">OCR:</strong> {att.ocr_text}</p>
                  )}
                  {att.extracted_text && !att.audio_transcript && !att.ocr_text && (
                    <p className="text-iip-text-muted leading-relaxed line-clamp-3"><strong className="text-iip-text">Extracted:</strong> {att.extracted_text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function HumintSemanticHitCard({ hit }: { hit: HumintSemanticSearchHit }) {
  return (
    <article className="rounded-2xl border border-iip-primary/15 bg-iip-primary/[0.04] p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-iip-text">{hit.title || 'Untitled HUMINT report'}</h3>
          <p className="mt-1 text-xs text-iip-text-muted">
            {hit.report_type || 'Unknown type'} · {hit.status || 'Unknown status'} · {hit.urgency || 'No urgency'}
          </p>
        </div>
        <span className="rounded-full bg-iip-primary/10 px-2.5 py-1 text-[11px] font-medium text-iip-primary">
          score {hit.score.toFixed(2)}
        </span>
      </div>
      <p className="text-sm text-iip-text-muted line-clamp-4">{hit.search_text || 'No semantic preview available.'}</p>
      <div className="flex flex-wrap gap-2 text-[11px] text-iip-text-muted">
        {hit.location_text && <span className="rounded-full border border-iip-border px-2 py-1">{hit.location_text}</span>}
        {hit.linked_case_ref && <span className="rounded-full border border-iip-border px-2 py-1">Case: {hit.linked_case_ref}</span>}
        {hit.linked_hotspot_label && <span className="rounded-full border border-iip-border px-2 py-1">Hotspot: {hit.linked_hotspot_label}</span>}
      </div>
    </article>
  );
}
