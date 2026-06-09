import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, GitBranch, Network, Radar, Search } from 'lucide-react';
import { SuspectDossierPhotoThumb } from '../components/suspects/SuspectDossierPhotoThumb';
import { showToast } from '../stores/toastStore';
import { formatSuspectProfileMeta } from '../utils/suspectProfileMeta';
import {
  loadKgCanvasSession,
  saveKgCanvasSession,
} from '../utils/kgCanvasSession';
import { AssociateNetworkGraph } from '../components/knowledge-graph/AssociateNetworkGraph';
import { buildRelationStats, relationStatKey } from '../components/knowledge-graph/kgGraphStats';
import {
  fetchAssociateNetwork,
  searchSuspectProfiles,
  type NetworkGraphResponse,
  type SuspectProfileHit,
} from '../api/knowledgeGraph';

function readInitialSession() {
  return loadKgCanvasSession();
}

export default function KGCanvas() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => readInitialSession()?.query ?? '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SuspectProfileHit[]>(
    () => readInitialSession()?.results ?? []
  );
  const [selected, setSelected] = useState<SuspectProfileHit | null>(
    () => readInitialSession()?.selected ?? null
  );
  const [graph, setGraph] = useState<NetworkGraphResponse | null>(
    () => readInitialSession()?.graph ?? null
  );
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [relationFilters, setRelationFilters] = useState<Set<string>>(new Set());

  const persistSession = useCallback(() => {
    saveKgCanvasSession({ query, results, selected, graph });
  }, [query, results, selected, graph]);

  useEffect(() => {
    persistSession();
  }, [persistSession]);

  const openMasterProfile = (masterSuspectId: string) => {
    saveKgCanvasSession({ query, results, selected, graph });
    navigate(`/suspects/masters/${masterSuspectId}?from=kg-canvas`, {
      state: { returnTo: '/kg-canvas', returnLabel: 'Back to network analysis' },
    });
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSelected(null);
    setGraph(null);
    setRelationFilters(new Set());
    try {
      const { results: hits } = await searchSuspectProfiles(query.trim(), { limit: 20 });
      setResults(hits);
      if (hits.length === 0) {
        showToast('info', 'No matching suspect profiles found.');
      }
    } catch {
      setResults([]);
      showToast('error', 'Could not search profiles. Check that you are signed in.');
    } finally {
      setSearching(false);
    }
  };

  const runAnalysis = async (hit: SuspectProfileHit) => {
    setSelected(hit);
    setLoadingGraph(true);
    setGraph(null);
    setRelationFilters(new Set());
    try {
      const network = await fetchAssociateNetwork(hit.master_suspect_id);
      setGraph(network);
    } catch {
      setGraph(null);
      showToast('error', 'Could not load associate network.');
    } finally {
      setLoadingGraph(false);
    }
  };

  const showGraphStage = Boolean(selected || graph || loadingGraph);

  const relationStats = useMemo(
    () => (graph?.edges ? buildRelationStats(graph.edges) : []),
    [graph?.edges]
  );

  const toggleRelationFilter = (key: string) => {
    setRelationFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeRelationFilterList = useMemo(
    () => [...relationFilters],
    [relationFilters]
  );

  return (
    <div className="kg-command-page">
      <header className="kg-command-header">
        <div className="kg-command-header__title">
          <Network size={22} className="kg-command-header__icon" />
          KNOWLEDGE GRAPH — LINK ANALYSIS
          <span className="kg-loading-pulse ml-2" aria-hidden />
        </div>
        <p className="kg-command-header__sub">
          Neural network intelligence map. Search a suspect profile, deploy analysis, and explore
          operational associate relationships with live dossier imagery.
        </p>
      </header>

      <div className="kg-search-panel">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="kg-search-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              className="kg-search-input pl-10"
              placeholder="Target identity — criminal name or alias"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            />
          </div>
          <button
            type="button"
            className="kg-btn-analyze shrink-0"
            onClick={() => void runSearch()}
            disabled={searching || query.trim().length < 2}
          >
            <Radar size={16} />
            {searching ? 'Scanning…' : 'Scan profiles'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div>
          <p className="kg-results-heading">Matching entities ({results.length})</p>
          <ul className="kg-results-list">
            {results.map((hit) => {
              const active = selected?.master_suspect_id === hit.master_suspect_id;
              const meta = formatSuspectProfileMeta(hit);
              return (
                <li
                  key={hit.master_suspect_id}
                  className={`kg-results-row${active ? ' kg-results-row--active' : ''}`}
                >
                  <div className="kg-results-row__identity">
                    <SuspectDossierPhotoThumb
                      dossierDraftId={hit.dossier_draft_id}
                      photoId={hit.photo_id}
                      storageKey={hit.storage_key}
                      alt={hit.criminal_name || hit.display_name}
                      size="list"
                    />
                    <div className="kg-results-row__text">
                      <p className="kg-results-name">{hit.criminal_name || hit.display_name}</p>
                      {meta ? <p className="kg-results-meta">{meta}</p> : null}
                      {!meta && hit.alias_name ? (
                        <p className="kg-results-alias">Alias: {hit.alias_name}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="kg-results-row__actions">
                    <button
                      type="button"
                      className="kg-btn-profile"
                      onClick={() => openMasterProfile(hit.master_suspect_id)}
                    >
                      View profile
                    </button>
                    <button
                      type="button"
                      className="kg-btn-analyze"
                      onClick={() => void runAnalysis(hit)}
                      disabled={loadingGraph}
                    >
                      <GitBranch size={16} />
                      {loadingGraph && active ? 'Mapping…' : 'Run analysis'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showGraphStage && (
        <div className="kg-graph-stage">
          <div className="kg-graph-stage__bar">
            <Activity size={16} className="kg-graph-stage__bar-icon" />
            {selected
              ? `Associate network — ${selected.criminal_name || selected.display_name}`
              : 'Initializing network…'}
          </div>
          {graph?.error && (
            <p className="kg-graph-stage__warn">
              Neo4j offline — showing dossier links ({graph.error})
            </p>
          )}
          {graph && relationStats.length > 0 && (
            <div className="kg-analysis-summary">
              <div className="kg-analysis-summary__head">
                <p className="kg-analysis-summary__title">Filter by link type</p>
                {relationFilters.size > 0 && (
                  <button
                    type="button"
                    className="kg-analysis-summary__clear"
                    onClick={() => setRelationFilters(new Set())}
                  >
                    Show all
                  </button>
                )}
              </div>
              <p className="kg-analysis-summary__hint">
                Click tags to show only those relations on the network
              </p>
              <div className="kg-analysis-summary__chips">
                {relationStats.map((stat) => {
                  const key = relationStatKey(stat);
                  const selected = relationFilters.has(key);
                  const dimmed = relationFilters.size > 0 && !selected;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`kg-analysis-chip${stat.linkKind === 'relative' ? ' kg-analysis-chip--muted' : ''}${selected ? ' kg-analysis-chip--active' : ''}${dimmed ? ' kg-analysis-chip--dim' : ''}`}
                      onClick={() => toggleRelationFilter(key)}
                      aria-pressed={selected}
                    >
                      {stat.label}
                      <strong>{stat.count}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {loadingGraph && !graph ? (
            <div className="kg-graph-empty">
              <span className="kg-loading-pulse w-3 h-3" />
              <p>Rendering force-directed intelligence graph…</p>
            </div>
          ) : graph ? (
            <AssociateNetworkGraph
              nodes={graph.nodes}
              edges={graph.edges}
              centerId={graph.center_id}
              activeRelationFilters={activeRelationFilterList}
              onOpenSuspectProfile={openMasterProfile}
            />
          ) : (
            <div className="kg-graph-empty">
              <p>No network data for this profile.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
