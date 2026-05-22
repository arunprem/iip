import { renderAssistantMarkdown } from '../../utils/renderAssistantMarkdown';

interface AssistantMessageContentProps {
  content: string;
  isStreaming?: boolean;
}

export function AssistantMessageContent({
  content,
  isStreaming = false,
}: AssistantMessageContentProps) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className={`workbench-prose ${isStreaming ? 'workbench-prose--streaming' : ''}`}>
      {renderAssistantMarkdown(content)}
    </div>
  );
}
