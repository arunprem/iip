import { useState } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { AdminFormField } from '../../admin/AdminFormField';
import type { SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { assistantExtractModusTags, assistantSynthesizeMO } from '../../../api/assistant';
import { normalizeModusTag, parseModusOperandi } from '../../../pages/suspects/suspectFormUtils';
import { showToast } from '../../../stores/toastStore';

interface SuspectModusOperandiStepProps {
  draft: SuspectDossierDraft;
  onChange: (patch: Partial<SuspectDossierDraft>) => void;
}

export function SuspectModusOperandiStep({ draft, onChange }: SuspectModusOperandiStepProps) {
  const [synthesizingMO, setSynthesizingMO] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);

  const removeTag = (tag: string) => {
    onChange({
      modusOperandiTags: draft.modusOperandiTags.filter(
        (existing) => existing.toLowerCase() !== tag.toLowerCase()
      ),
    });
  };

  const handleSynthesizeMO = async () => {
    if (!draft.cases || draft.cases.length === 0) {
      showToast('warning', 'Please add some cases in the cases step first.');
      return;
    }
    setSynthesizingMO(true);
    try {
      const generated = await assistantSynthesizeMO(draft.cases);
      const parsed = parseModusOperandi(generated);
      let suggestedTags = draft.modusOperandiTags;
      if (parsed.notes.trim()) {
        suggestedTags = (await assistantExtractModusTags(parsed.notes)).map(normalizeModusTag).filter(Boolean);
      }
      onChange({
        modusOperandi: parsed.notes,
        modusOperandiTags:
          suggestedTags.length > 0
            ? Array.from(new Set(suggestedTags))
            : parsed.tags.length > 0
              ? Array.from(new Set(parsed.tags.map(normalizeModusTag).filter(Boolean)))
              : draft.modusOperandiTags,
      });
      showToast('success', 'Modus operandi and AI tag suggestions generated.');
    } catch {
      showToast('error', 'Failed to generate modus operandi.');
    } finally {
      setSynthesizingMO(false);
    }
  };

  const handleSuggestTags = async () => {
    if (!draft.modusOperandi.trim()) {
      showToast('warning', 'Enter a modus operandi description first.');
      return;
    }
    setSuggestingTags(true);
    try {
      const tags = await assistantExtractModusTags(draft.modusOperandi);
      onChange({
        modusOperandiTags: Array.from(new Set(tags.map(normalizeModusTag).filter(Boolean))),
      });
      showToast('success', 'AI suggested modus operandi tags. Review and remove any not needed.');
    } catch {
      showToast('error', 'Failed to suggest modus operandi tags.');
    } finally {
      setSuggestingTags(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-iip-text-muted">
        Enter the modus operandi description first. AI will read the narrative and suggest
        searchable tags. Users can review the suggestions and remove any unwanted tags.
      </p>

      <AdminFormField
        id="modus-operandi"
        label={
          <div className="flex items-center justify-between w-full">
            <span>Modus Operandi Description</span>
            <button
              type="button"
              className="text-[10px] text-iip-primary font-medium hover:underline flex items-center gap-0.5 ml-2"
              onClick={handleSynthesizeMO}
              disabled={synthesizingMO || draft.cases.length === 0}
              title={draft.cases.length === 0 ? "Add crime cases first to enable LLM generation" : "Synthesize modus operandi using AI"}
            >
              {synthesizingMO ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Generate from Cases
            </button>
          </div>
        }
        hint="Optional narrative notes: signature behavior, targets, geography, timing, and escalation pattern."
      >
        <textarea
          id="modus-operandi"
          className="form-control h-48 w-full resize-y"
          value={draft.modusOperandi}
          onChange={(e) => onChange({ modusOperandi: e.target.value })}
          placeholder="Describe the suspect's modus operandi, or click 'Generate from Cases' above to synthesize it from entered cases..."
        />
      </AdminFormField>

      <AdminFormField
        id="modus-tags"
        label={
          <div className="flex items-center justify-between w-full">
            <span>Suggested modus tags</span>
            <button
              type="button"
              className="text-[10px] text-iip-primary font-medium hover:underline flex items-center gap-0.5 ml-2"
              onClick={handleSuggestTags}
              disabled={suggestingTags || !draft.modusOperandi.trim()}
              title={
                !draft.modusOperandi.trim()
                  ? 'Enter a modus operandi description first'
                  : 'Use AI to suggest searchable modus operandi tags'
              }
            >
              {suggestingTags ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Suggest Tags
            </button>
          </div>
        }
        hint="AI suggests tags from the description. Review them and remove any not required."
      >
        {draft.modusOperandiTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {draft.modusOperandiTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-iip-primary/10 px-3 py-1 text-xs font-medium text-iip-primary"
              >
                {tag}
                <button
                  type="button"
                  className="opacity-70 transition-opacity hover:opacity-100"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-iip-text-muted">
            No tags suggested yet. Add the description above and click <strong>Suggest Tags</strong>.
          </p>
        )}
      </AdminFormField>
    </div>
  );
}
