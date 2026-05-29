import { renderSuspectNoteText } from '../../utils/renderAssistantMarkdown';

interface SuspectNoteContentProps {
  content: string;
  criminalName?: string;
  isStreaming?: boolean;
}

function stripLeadingName(text: string, criminalName?: string): string {
  if (!criminalName?.trim()) return text;
  const escaped = criminalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^\\s*${escaped}\\s*[:,-]?\\s*`, 'i'), '').trim();
}

/** Compact note renderer for suspect cards — plain text with phone highlighting. */
export function SuspectNoteContent({
  content,
  criminalName,
  isStreaming = false,
}: SuspectNoteContentProps) {
  const cleaned = stripLeadingName(content.trim(), criminalName);
  if (!cleaned) return null;

  const paragraphs = cleaned
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  return (
    <div
      className={`workbench-prose workbench-prose--suspect-note ${isStreaming ? 'workbench-prose--streaming' : ''}`}
    >
      {paragraphs.map((paragraph, index) => (
        <div key={index} className="workbench-suspect-note-p">
          {renderSuspectNoteText(paragraph)}
        </div>
      ))}
    </div>
  );
}
