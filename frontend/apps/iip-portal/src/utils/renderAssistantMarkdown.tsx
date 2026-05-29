import type { ReactNode } from 'react';

/** Protect phone numbers and long IDs before aggressive line-break normalization. */
function protectNumericTokens(text: string): { text: string; restore: (s: string) => string } {
  const tokens: string[] = [];
  const mark = (value: string) => {
    const id = tokens.length;
    tokens.push(value);
    return `\uE000${id}\uE001`;
  };

  let out = text.replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g, mark);
  out = out.replace(/\b\d{8,}\b/g, mark);

  return {
    text: out,
    restore: (value: string) =>
      value.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] ?? ''),
  };
}

/** Normalize LLM text that often omits newlines between sections and list items. */
export function normalizeAssistantContent(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const { text: protectedText, restore } = protectNumericTokens(text);
  text = protectedText;

  text = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/\n/g, '\u0000'));

  text = text.replace(/Template(?=Classification)/gi, 'Template\n\n');
  text = text.replace(/Summary:(?=This)/i, 'Summary:\n\n');

  const sectionWords =
    'Incidents|Arrests|Emerging Threats|Notable Trends and Patterns|Recommendations|Confidential Notes|Verification|Executive Summary|Key Findings|Analysis|Sources|SUBJECT';

  text = text.replace(
    new RegExp(`(${sectionWords}):`, 'gi'),
    '\n\n$1:'
  );

  text = text.replace(
    /(Classification|Date|Summary|Please note):/gi,
    '\n$1:'
  );

  text = text.replace(
    /(CONFIDENTIAL|SECRET|RESTRICTED|TOP SECRET|UNCLASSIFIED)(?=[A-Z][a-z])/gi,
    '$1\n\n'
  );

  text = text.replace(/([a-z\)])(\d{1,2})\.\s+/g, '$1\n$2. ');
  text = text.replace(/([a-z])([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)*:)/g, '$1\n\n$2');

  text = text.replace(/:\s*(?=(?:CONFIDENTIAL|SECRET|RESTRICTED|TOP SECRET|UNCLASSIFIED)\b)/gi, ': ');

  text = text.replace(/\u0000/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return restore(text).trim();
}

type ContentBlock =
  | { type: 'code'; content: string }
  | { type: 'title'; text: string }
  | { type: 'classification'; level: string }
  | { type: 'section'; title: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ordered'; items: OrderedItem[] }
  | { type: 'unordered'; items: string[] }
  | { type: 'keyvalue'; label: string; value: string };

interface OrderedItem {
  num: string;
  label?: string;
  value: string;
}

const CLASSIFICATION_RE =
  /^Classification:\s*(CONFIDENTIAL|SECRET|RESTRICTED|TOP SECRET|UNCLASSIFIED)\s*$/i;
const SECTION_HEADER_RE = /^([A-Z][A-Za-z0-9\s/&'.-]{2,56}):\s*$/;
const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9\s/&'.-]{0,48}):\s+(.+)$/;
const ORDERED_RE = /^(\d+)\.\s+(.+)$/;
const HEADING_MD_RE = /^(#{1,4})\s+(.+)$/;

function parseOrderedBody(body: string): { label?: string; value: string } {
  const kv = body.match(KEY_VALUE_RE);
  if (kv) return { label: kv[1].trim(), value: kv[2].trim() };
  return { value: body.trim() };
}

function groupContentBlocks(normalized: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const parts = normalized.split(/```/);

  parts.forEach((part, partIndex) => {
    if (partIndex % 2 === 1) {
      blocks.push({
        type: 'code',
        content: part.replace(/^\w*\n?/, '').trimEnd(),
      });
      return;
    }

    const lines = part
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let i = 0;
    let titleUsed = false;

    while (i < lines.length) {
      const line = lines[i];

      const codeHeading = line.match(HEADING_MD_RE);
      if (codeHeading) {
        blocks.push({
          type: 'section',
          title: codeHeading[2],
        });
        i++;
        continue;
      }

      const classMatch = line.match(CLASSIFICATION_RE);
      if (classMatch) {
        blocks.push({ type: 'classification', level: classMatch[1].toUpperCase() });
        i++;
        continue;
      }

      const classInline = line.match(/^Classification:\s*(.+)$/i);
      if (classInline && !CLASSIFICATION_RE.test(line)) {
        blocks.push({
          type: 'classification',
          level: classInline[1].trim().toUpperCase(),
        });
        i++;
        continue;
      }

      if (SECTION_HEADER_RE.test(line)) {
        blocks.push({
          type: 'section',
          title: line.replace(/:$/, '').trim(),
        });
        i++;
        continue;
      }

      if (ORDERED_RE.test(line)) {
        const items: OrderedItem[] = [];
        while (i < lines.length && ORDERED_RE.test(lines[i])) {
          const m = lines[i].match(ORDERED_RE)!;
          const parsed = parseOrderedBody(m[2]);
          items.push({
            num: m[1],
            label: parsed.label,
            value: parsed.value,
          });
          i++;
        }
        blocks.push({ type: 'ordered', items });
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ''));
          i++;
        }
        blocks.push({ type: 'unordered', items });
        continue;
      }

      const kv = line.match(KEY_VALUE_RE);
      if (kv) {
        blocks.push({ type: 'keyvalue', label: kv[1].trim(), value: kv[2].trim() });
        i++;
        continue;
      }

      if (!titleUsed && line.length > 8 && !line.includes(':')) {
        blocks.push({ type: 'title', text: line });
        titleUsed = true;
        i++;
        continue;
      }

      const paraLines: string[] = [line];
      i++;
      while (
        i < lines.length &&
        !ORDERED_RE.test(lines[i]) &&
        !SECTION_HEADER_RE.test(lines[i]) &&
        !CLASSIFICATION_RE.test(lines[i]) &&
        !/^[-*]\s+/.test(lines[i]) &&
        !lines[i].match(HEADING_MD_RE) &&
        !lines[i].match(KEY_VALUE_RE)
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  });

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|(?:\+91[\s-]?)?[6-9]\d{9}\b|\b\d{10}\b)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${n++}`} className="font-semibold text-iip-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c-${n++}`} className="workbench-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={`${keyPrefix}-i-${n++}`} className="text-iip-text-muted">
          {token.slice(1, -1)}
        </em>
      );
    } else if (/^\d/.test(token) || token.startsWith('+91')) {
      nodes.push(
        <span key={`${keyPrefix}-p-${n++}`} className="workbench-contact-value">
          {token}
        </span>
      );
    } else {
      nodes.push(token);
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length ? nodes : [text];
}

function classificationTone(level: string): string {
  const u = level.toUpperCase();
  if (u.includes('TOP SECRET') || u === 'SECRET') {
    return 'workbench-classification--secret';
  }
  if (u === 'CONFIDENTIAL') {
    return 'workbench-classification--confidential';
  }
  if (u === 'RESTRICTED') {
    return 'workbench-classification--restricted';
  }
  return 'workbench-classification--default';
}

function renderBlock(block: ContentBlock, index: number): ReactNode {
  const key = `wb-${index}`;

  switch (block.type) {
    case 'code':
      return (
        <pre key={key} className="workbench-code-block">
          <code>{block.content}</code>
        </pre>
      );

    case 'title':
      return (
        <h2 key={key} className="workbench-doc-title">
          {renderInline(block.text, key)}
        </h2>
      );

    case 'classification':
      return (
        <div key={key} className={`workbench-classification ${classificationTone(block.level)}`}>
          <span className="workbench-classification-label">Classification</span>
          <span className="workbench-classification-value">{block.level}</span>
        </div>
      );

    case 'section':
      return (
        <h3 key={key} className="workbench-section-heading">
          {block.title}
        </h3>
      );

    case 'keyvalue':
      return (
        <div key={key} className="workbench-kv-row">
          <span className="workbench-kv-label">{block.label}</span>
          <span className="workbench-kv-value">{renderInline(block.value, key)}</span>
        </div>
      );

    case 'ordered':
      return (
        <ol key={key} className="workbench-ordered-list">
          {block.items.map((item) => (
            <li key={`${key}-${item.num}`} className="workbench-ordered-item">
              <span className="workbench-ordered-num" aria-hidden>
                {item.num}
              </span>
              <div className="workbench-ordered-body">
                {item.label ? (
                  <div className="workbench-kv-row workbench-kv-row--nested">
                    <span className="workbench-kv-label">{item.label}</span>
                    <span className="workbench-kv-value">
                      {renderInline(item.value, `${key}-${item.num}`)}
                    </span>
                  </div>
                ) : (
                  <span className="workbench-kv-value">
                    {renderInline(item.value, `${key}-${item.num}`)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    case 'unordered':
      return (
        <ul key={key} className="workbench-bullet-list">
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className="workbench-bullet-item">
              {renderInline(item, `${key}-u-${j}`)}
            </li>
          ))}
        </ul>
      );

    case 'paragraph':
      return (
        <p key={key} className="workbench-paragraph">
          {renderInline(block.text, key)}
        </p>
      );

    default:
      return null;
  }
}

export function renderSuspectNoteText(text: string): ReactNode {
  const { text: protectedText, restore } = protectNumericTokens(text);
  return renderInline(restore(protectedText.trim()), 'sn');
}

export function renderAssistantMarkdown(content: string): ReactNode {
  const normalized = normalizeAssistantContent(content);
  const blocks = groupContentBlocks(normalized);
  return blocks.map((block, i) => renderBlock(block, i));
}
