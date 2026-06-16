import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Crosshair,
  Download,
  Fingerprint,
  Loader2,
  Radar,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react';
import {
  searchSuspectProfiles,
  type SuspectProfileHit,
} from '../api/knowledgeGraph';
import { getSuspectDossierDetail } from '../api/suspectDossiers';
import {
  generateThreatProfile,
  findCrossDossierPatterns,
  type ThreatProfile,
  type CrossDossierResult,
  type ThreatProfileRequest,
} from '../api/threatProfiler';
import { SuspectDossierPhotoThumb } from '../components/suspects/SuspectDossierPhotoThumb';
import { ThreatRadarChart } from '../components/threat-profiler/ThreatRadarChart';
import { ProfileSection } from '../components/threat-profiler/ProfileSection';
import { showToast } from '../stores/toastStore';
import { groupProfileHitsByMaster } from '../utils/groupProfileHits';
import { jsPDF } from 'jspdf';

type SectionStatus = 'pending' | 'generating' | 'complete';

interface SectionState {
  id: string;
  title: string;
  content: string;
  status: SectionStatus;
}

const INITIAL_SECTIONS: SectionState[] = [
  { id: 'criminal_psychology', title: 'Criminal Psychology Profile', content: '', status: 'pending' },
  { id: 'mo_signature', title: 'Modus Operandi Signature', content: '', status: 'pending' },
  { id: 'escalation_trajectory', title: 'Escalation Trajectory', content: '', status: 'pending' },
  { id: 'actionable_intelligence', title: 'Actionable Intelligence', content: '', status: 'pending' },
];

const THREAT_TIER_CONFIG: Record<string, { color: string; bg: string; icon: typeof Shield }> = {
  LOW: { color: '#30d158', bg: 'rgba(48,209,88,0.12)', icon: Shield },
  MODERATE: { color: '#ffcc00', bg: 'rgba(255,204,0,0.12)', icon: ShieldAlert },
  HIGH: { color: '#ff9500', bg: 'rgba(255,149,0,0.12)', icon: AlertTriangle },
  CRITICAL: { color: '#ff2d55', bg: 'rgba(255,45,85,0.12)', icon: Zap },
  UNKNOWN: { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', icon: Shield },
};

export default function ThreatProfiler() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SuspectProfileHit[]>([]);
  const [selected, setSelected] = useState<SuspectProfileHit | null>(null);

  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState<SectionState[]>(INITIAL_SECTIONS);
  const [profile, setProfile] = useState<ThreatProfile | null>(null);
  const [patterns, setPatterns] = useState<CrossDossierResult | null>(null);
  const [generationComplete, setGenerationComplete] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // ── Search ───────────────────────────────────────────────────────────
  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSelected(null);
    setProfile(null);
    setPatterns(null);
    setGenerationComplete(false);
    setSections(INITIAL_SECTIONS);
    try {
      const { results: hits } = await searchSuspectProfiles(query.trim(), { limit: 15 });
      setResults(groupProfileHitsByMaster(hits));
      if (hits.length === 0) showToast('info', 'No matching suspect profiles found.');
    } catch {
      setResults([]);
      showToast('error', 'Search failed. Check your connection.');
    } finally {
      setSearching(false);
    }
  };

  // ── Select suspect ──────────────────────────────────────────────────
  const selectSuspect = (hit: SuspectProfileHit) => {
    setSelected(hit);
    setProfile(null);
    setPatterns(null);
    setGenerationComplete(false);
    setSections(INITIAL_SECTIONS);
  };

  // ── Simulate section-by-section streaming ────────────────────────────
  const animateSection = useCallback(
    (sectionId: string, fullText: string): Promise<void> => {
      return new Promise((resolve) => {
        // Mark as generating
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, status: 'generating' } : s))
        );

        const words = fullText.split(' ');
        let idx = 0;
        const interval = setInterval(() => {
          idx += 3; // 3 words at a time for speed
          const partial = words.slice(0, idx).join(' ');
          setSections((prev) =>
            prev.map((s) => (s.id === sectionId ? { ...s, content: partial } : s))
          );

          // Auto-scroll
          contentRef.current?.scrollTo({
            top: contentRef.current.scrollHeight,
            behavior: 'smooth',
          });

          if (idx >= words.length) {
            clearInterval(interval);
            setSections((prev) =>
              prev.map((s) =>
                s.id === sectionId ? { ...s, content: fullText, status: 'complete' } : s
              )
            );
            resolve();
          }
        }, 35);
      });
    },
    []
  );

  // ── Generate full profile ──────────────────────────────────────────
  const generateProfile = async () => {
    if (!selected || generating) return;
    setGenerating(true);
    setProfile(null);
    setPatterns(null);
    setGenerationComplete(false);
    setSections(INITIAL_SECTIONS);

    try {
      // 1. Fetch full dossier detail
      let dossierData: Record<string, unknown> = {};
      if (selected.dossier_id) {
        try {
          dossierData = await getSuspectDossierDetail(selected.dossier_id);
        } catch {
          // Use basic info if detail fetch fails
        }
      }

      // 2. Build the request from dossier data
      const cases = ((dossierData.cases as Array<Record<string, unknown>>) || []).map((c) => ({
        crime_number: String(c.crime_number || ''),
        crime_year: c.crime_year ? Number(c.crime_year) : null,
        police_station: c.police_station_name ? String(c.police_station_name) : null,
        act_section: c.act_section ? String(c.act_section) : null,
        brief: c.brief ? String(c.brief) : null,
        present_status: c.present_status ? String(c.present_status) : null,
      }));

      const associates = ((dossierData.associates as Array<Record<string, unknown>>) || []).map((a) => ({
        name: String(a.name || ''),
        association_type: String(a.association_type || ''),
        occupation: a.occupation ? String(a.occupation) : null,
        notes: a.notes ? String(a.notes) : null,
      }));

      const relatives = (dossierData.relatives as Array<Record<string, unknown>>) || [];

      const address = dossierData.address
        ? typeof dossierData.address === 'object'
          ? Object.values(dossierData.address as Record<string, unknown>)
              .filter(Boolean)
              .join(', ')
          : String(dossierData.address)
        : null;

      const req: ThreatProfileRequest = {
        suspect_name: selected.criminal_name || selected.display_name,
        alias_name: selected.alias_name,
        fathers_name: dossierData.fathers_name ? String(dossierData.fathers_name) : null,
        gender: selected.gender || null,
        age: dossierData.age ? String(dossierData.age) : null,
        address,
        cases,
        associates,
        relatives,
      };

      // 3. Call the LLM
      const result = await generateThreatProfile(req);
      setProfile(result);

      // 4. Animate sections one-by-one
      const sectionData: { id: string; text: string }[] = [
        { id: 'criminal_psychology', text: result.criminal_psychology },
        { id: 'mo_signature', text: result.mo_signature },
        { id: 'escalation_trajectory', text: result.escalation_trajectory },
        { id: 'actionable_intelligence', text: result.actionable_intelligence },
      ];

      for (const section of sectionData) {
        if (section.text) {
          await animateSection(section.id, section.text);
        } else {
          setSections((prev) =>
            prev.map((s) =>
              s.id === section.id
                ? { ...s, content: 'Insufficient data for this section.', status: 'complete' }
                : s
            )
          );
        }
      }

      // 5. Run cross-dossier pattern analysis
      if (result.mo_signature) {
        const caseSections = cases
          .map((c) => c.act_section)
          .filter((s): s is string => Boolean(s));

        try {
          const patternResult = await findCrossDossierPatterns(
            result.mo_signature,
            selected.criminal_name || selected.display_name,
            caseSections,
            selected.master_suspect_id
          );
          setPatterns(patternResult);
        } catch {
          // Non-critical, skip
        }
      }

      setGenerationComplete(true);
    } catch (err) {
      showToast('error', 'Threat profile generation failed. Please try again.');
      setSections(INITIAL_SECTIONS);
    } finally {
      setGenerating(false);
    }
  };

  // ── Export report ────────────────────────────────────────────────────
  const exportReport = () => {
    if (!profile || !selected) return;

    // Helper to sanitize text for standard PDF fonts (Helvetica doesn't support wide Unicode)
    const cleanTextForPDF = (str: string): string => {
      if (!str) return '';
      return str
        .replace(/[•\u2022]/g, '-')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2014\u2013]/g, '-')
        .replace(/[^\x00-\x7F]/g, ''); // strip any other non-ASCII characters
    };

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Helper to add classified footer
      const drawFooter = () => {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          'CLASSIFIED INTELLIGENCE PRODUCT - KERALA POLICE',
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      };

      // Helper to check space and add page
      const checkSpace = (needed: number) => {
        if (y + needed > pageHeight - margin - 10) {
          drawFooter();
          doc.addPage();
          y = margin;
          // Redraw top border
          doc.setDrawColor(220, 38, 38); // Red for secret/classified
          doc.setLineWidth(0.5);
          doc.line(margin, y, pageWidth - margin, y);
          y += 8;
        }
      };

      const addText = (
        text: string,
        fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
        fontSize: number = 10,
        lineHeight: number = 5.5,
        color: [number, number, number] = [15, 23, 42]
      ) => {
        doc.setFont('Helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(color[0], color[1], color[2]);

        const cleaned = cleanTextForPDF(text);
        const splitText = doc.splitTextToSize(cleaned, contentWidth);
        for (const line of splitText) {
          checkSpace(lineHeight);
          doc.text(line, margin, y);
          y += lineHeight;
        }
      };

      const addSectionHeading = (title: string) => {
        checkSpace(15);
        y += 2;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(70, 95, 255); // Primary color
        doc.text(cleanTextForPDF(title).toUpperCase(), margin, y);
        y += 4;
        
        doc.setDrawColor(70, 95, 255);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + 40, y);
        y += 6;
      };

      // --- 1. Top Banner ---
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentWidth, 18, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('AI THREAT PROFILER - INTELLIGENCE DOSSIER', margin + 6, y + 11);
      y += 26;

      // --- 2. Subject Metadata ---
      addText(`Subject: ${cleanTextForPDF(selected.criminal_name || selected.display_name)}`, 'bold', 11, 6);
      if (selected.alias_name) {
        addText(`Alias: ${cleanTextForPDF(selected.alias_name)}`, 'italic', 10, 5);
      }
      addText(`Generated: ${cleanTextForPDF(new Date().toLocaleString())}`, 'normal', 9, 5, [100, 116, 139]);

      // Threat Tier Badge color mapping
      let tierColor: [number, number, number] = [142, 142, 147];
      if (profile.threat_tier === 'LOW') tierColor = [48, 209, 88];
      else if (profile.threat_tier === 'MODERATE') tierColor = [255, 204, 0];
      else if (profile.threat_tier === 'HIGH') tierColor = [255, 149, 0];
      else if (profile.threat_tier === 'CRITICAL') tierColor = [255, 45, 85];

      checkSpace(8);
      y += 2;
      doc.setFillColor(tierColor[0], tierColor[1], tierColor[2]);
      doc.rect(margin, y, 42, 6, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`${cleanTextForPDF(profile.threat_tier)} THREAT TIER`, margin + 3, y + 4.5);
      y += 12;

      // --- 3. Threat Assessment Matrix ---
      addSectionHeading('Threat Assessment Matrix');
      const scores = [
        { label: 'Violence Propensity', val: profile.risk_scores.violence_propensity },
        { label: 'Recidivism Risk', val: profile.risk_scores.recidivism_risk },
        { label: 'Network Influence', val: profile.risk_scores.network_influence },
        { label: 'Flight Risk', val: profile.risk_scores.flight_risk },
        { label: 'Radicalization Potential', val: profile.risk_scores.radicalization_potential },
      ];

      for (const score of scores) {
        checkSpace(6);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.text(cleanTextForPDF(score.label), margin, y);

        // Draw progress bar track
        const trackX = margin + 50;
        const trackW = 80;
        doc.setFillColor(240, 240, 240);
        doc.rect(trackX, y - 3, trackW, 3, 'F');

        // Draw progress bar fill
        let barColor = [48, 209, 88]; // green
        if (score.val >= 75) barColor = [255, 45, 85]; // red
        else if (score.val >= 50) barColor = [255, 149, 0]; // orange
        else if (score.val >= 25) barColor = [255, 204, 0]; // yellow
        doc.setFillColor(barColor[0], barColor[1], barColor[2]);
        doc.rect(trackX, y - 3, (score.val / 100) * trackW, 3, 'F');

        // Score text
        doc.setFont('Helvetica', 'bold');
        doc.text(`${score.val}/100`, trackX + trackW + 6, y);
        y += 6;
      }
      y += 6;

      // --- 4. Profile Sections ---
      addSectionHeading('Criminal Psychology Profile');
      addText(profile.criminal_psychology, 'normal', 9.5, 5.5);
      y += 4;

      addSectionHeading('Modus Operandi Signature');
      addText(profile.mo_signature, 'normal', 9.5, 5.5);
      y += 4;

      addSectionHeading('Escalation Trajectory');
      addText(profile.escalation_trajectory, 'normal', 9.5, 5.5);
      y += 4;

      addSectionHeading('Actionable Intelligence');
      addText(profile.actionable_intelligence, 'normal', 9.5, 5.5);
      y += 4;

      // --- 5. Cross Dossier Patterns ---
      if (patterns?.pattern_matches?.length) {
        addSectionHeading('Cross-Dossier Pattern Matches');
        for (const match of patterns.pattern_matches) {
          checkSpace(18);
          // Match Card Header
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(15, 23, 42);
          doc.text(cleanTextForPDF(match.suspect_name), margin, y);

          let confColor = [48, 209, 88];
          if (match.confidence === 'HIGH') confColor = [255, 45, 85];
          else if (match.confidence === 'MEDIUM') confColor = [255, 149, 0];

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(confColor[0], confColor[1], confColor[2]);
          doc.text(`[${cleanTextForPDF(match.confidence)} CONFIDENCE]`, margin + contentWidth - 40, y);
          y += 5;

          // Reason
          addText(match.similarity_reason, 'normal', 8.5, 4.5, [100, 116, 139]);
          y += 4;
        }

        if (patterns.analysis_summary) {
          addSectionHeading('Pattern Analysis Summary');
          addText(patterns.analysis_summary, 'normal', 9, 5);
        }
      }

      // Draw footer on last page before saving
      drawFooter();

      // Download file with proper extension
      const safeName = cleanTextForPDF(selected.criminal_name || 'unknown').replace(/\s+/g, '-').toLowerCase();
      
      // Use jsPDF's built-in save method to trigger a clean file download with correct extension
      doc.save(`threat-profile-${safeName}-${Date.now()}.pdf`);
      
      showToast('success', 'PDF Report exported successfully.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to generate PDF. Check console.');
    }
  };

  const tierConfig = profile ? THREAT_TIER_CONFIG[profile.threat_tier] || THREAT_TIER_CONFIG.UNKNOWN : null;
  const TierIcon = tierConfig?.icon || Shield;

  return (
    <div className="tp-page">
      {/* Scanline overlay */}
      <div className="tp-scanline" aria-hidden />

      {/* Header */}
      <header className="tp-header">
        <div className="tp-header__left">
          <div className="tp-header__icon-wrap">
            <Brain size={22} />
          </div>
          <div>
            <h1 className="tp-header__title">
              AI THREAT PROFILER
              <span className="tp-header__pulse" aria-hidden />
            </h1>
            <p className="tp-header__sub">
              Behavioral analysis engine — Deep criminal profiling with cross-dossier pattern intelligence
            </p>
          </div>
        </div>
        <div className="tp-header__right">
          <span className="tp-header__status">
            <Sparkles size={12} />
            LLM ENGINE ACTIVE
          </span>
          {generationComplete && (
            <button type="button" className="tp-btn-export" onClick={exportReport}>
              <Download size={14} />
              Export report
            </button>
          )}
        </div>
      </header>

      <div className="tp-body">
        {/* Left — Suspect Search */}
        <aside className="tp-sidebar">
          <div className="tp-sidebar__search">
            <div className="tp-sidebar__search-bar">
              <Search size={16} className="tp-sidebar__search-icon" />
              <input
                className="tp-sidebar__search-input"
                placeholder="Search suspect by name or alias…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              />
            </div>
            <button
              type="button"
              className="tp-btn-scan"
              onClick={() => void runSearch()}
              disabled={searching || query.trim().length < 2}
            >
              <Radar size={14} />
              {searching ? 'Scanning…' : 'Scan'}
            </button>
          </div>

          {results.length > 0 && (
            <ul className="tp-sidebar__results">
              {results.map((hit) => {
                const isActive =
                  (selected?.dossier_id ?? selected?.master_suspect_id) ===
                  (hit.dossier_id ?? hit.master_suspect_id);
                return (
                  <li key={hit.dossier_id ?? hit.master_suspect_id}>
                    <button
                      type="button"
                      className={`tp-suspect-card ${isActive ? 'tp-suspect-card--active' : ''}`}
                      onClick={() => selectSuspect(hit)}
                    >
                      <SuspectDossierPhotoThumb
                        dossierDraftId={hit.dossier_draft_id}
                        photoId={hit.photo_id}
                        storageKey={hit.storage_key}
                        alt={hit.criminal_name || hit.display_name}
                        size="list"
                      />
                      <div className="tp-suspect-card__info">
                        <p className="tp-suspect-card__name">
                          {hit.criminal_name || hit.display_name}
                        </p>
                        {hit.alias_name && (
                          <p className="tp-suspect-card__alias">aka {hit.alias_name}</p>
                        )}
                        {hit.office_name && (
                          <p className="tp-suspect-card__meta">{hit.office_name}</p>
                        )}
                      </div>
                      <ArrowRight size={14} className="tp-suspect-card__arrow" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Selected suspect detail */}
          {selected && (
            <div className="tp-sidebar__selected">
              <div className="tp-sidebar__selected-header">
                <SuspectDossierPhotoThumb
                  dossierDraftId={selected.dossier_draft_id}
                  photoId={selected.photo_id}
                  storageKey={selected.storage_key}
                  alt={selected.criminal_name || selected.display_name}
                  size="mugshot"
                />
                <div>
                  <p className="tp-sidebar__selected-name">
                    {selected.criminal_name || selected.display_name}
                  </p>
                  {selected.alias_name && (
                    <p className="tp-sidebar__selected-alias">Alias: {selected.alias_name}</p>
                  )}
                  {selected.gender && (
                    <p className="tp-sidebar__selected-meta">{selected.gender}</p>
                  )}
                  {selected.office_name && (
                    <p className="tp-sidebar__selected-meta">{selected.office_name}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="tp-btn-generate"
                onClick={() => void generateProfile()}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Profiling…
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Generate Threat Profile
                  </>
                )}
              </button>
            </div>
          )}

          {!selected && results.length === 0 && !searching && (
            <div className="tp-sidebar__empty">
              <User size={32} className="tp-sidebar__empty-icon" />
              <p>Search for a suspect to begin profiling</p>
            </div>
          )}
        </aside>

        {/* Center — Profile Sections */}
        <section className="tp-content" ref={contentRef}>
          {!profile && !generating && (
            <div className="tp-content__empty">
              <div className="tp-content__empty-icon">
                <Brain size={48} />
              </div>
              <h2>Select a suspect and generate their threat profile</h2>
              <p>
                The AI engine will analyze criminal psychology, modus operandi patterns,
                escalation trajectory, and produce actionable intelligence recommendations.
              </p>
            </div>
          )}

          {(generating || profile) && (
            <div className="tp-sections">
              {sections.map((s, i) => (
                <ProfileSection
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  content={s.content}
                  status={s.status}
                  sectionIndex={i}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right — Threat Matrix + Patterns */}
        <aside className="tp-intel-panel">
          {profile && (
            <>
              {/* Threat Tier Badge */}
              <div className="tp-tier-card" style={{ borderColor: tierConfig?.color }}>
                <div
                  className="tp-tier-card__badge"
                  style={{ backgroundColor: tierConfig?.bg, color: tierConfig?.color }}
                >
                  <TierIcon size={16} />
                  <span>{profile.threat_tier} THREAT</span>
                </div>
              </div>

              {/* Radar Chart */}
              <div className="tp-radar-card">
                <h3 className="tp-panel-heading">
                  <Crosshair size={14} />
                  Threat Assessment Matrix
                </h3>
                <ThreatRadarChart scores={profile.risk_scores} animated={true} size={260} />
              </div>

              {/* Risk Score Bars */}
              <div className="tp-risk-bars">
                {[
                  { key: 'violence_propensity', label: 'Violence', icon: Zap },
                  { key: 'recidivism_risk', label: 'Recidivism', icon: TrendingUp },
                  { key: 'network_influence', label: 'Network Influence', icon: Radar },
                  { key: 'flight_risk', label: 'Flight Risk', icon: ArrowRight },
                  { key: 'radicalization_potential', label: 'Radicalization', icon: AlertTriangle },
                ].map(({ key, label, icon: BarIcon }) => {
                  const val = profile.risk_scores[key as keyof typeof profile.risk_scores];
                  const color = val >= 75 ? '#ff2d55' : val >= 50 ? '#ff9500' : val >= 25 ? '#ffcc00' : '#30d158';
                  return (
                    <div key={key} className="tp-risk-bar">
                      <div className="tp-risk-bar__label">
                        <BarIcon size={12} />
                        <span>{label}</span>
                        <strong style={{ color }}>{val}</strong>
                      </div>
                      <div className="tp-risk-bar__track">
                        <div
                          className="tp-risk-bar__fill"
                          style={{
                            width: `${val}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 8px ${color}66`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Cross-Dossier Patterns */}
          {patterns && patterns.pattern_matches.length > 0 && (
            <div className="tp-patterns-card">
              <h3 className="tp-panel-heading">
                <Fingerprint size={14} />
                Similar Pattern Suspects
              </h3>
              <ul className="tp-patterns-list">
                {patterns.pattern_matches.map((match, i) => (
                  <li key={i} className="tp-pattern-match">
                    <div className="tp-pattern-match__header">
                      <span
                        className="tp-pattern-match__conf"
                        data-confidence={match.confidence}
                      >
                        {match.confidence}
                      </span>
                      <span className="tp-pattern-match__name">{match.suspect_name}</span>
                    </div>
                    <p className="tp-pattern-match__reason">{match.similarity_reason}</p>
                  </li>
                ))}
              </ul>
              {patterns.analysis_summary && (
                <p className="tp-patterns-summary">{patterns.analysis_summary}</p>
              )}
            </div>
          )}

          {!profile && !generating && (
            <div className="tp-intel-panel__empty">
              <Crosshair size={36} className="tp-intel-panel__empty-icon" />
              <p>Threat matrix will appear here after profile generation</p>
            </div>
          )}

          {generating && !profile && (
            <div className="tp-intel-panel__loading">
              <Loader2 size={28} className="animate-spin" />
              <p>Analyzing threat dimensions…</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
