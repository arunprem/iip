/**
 * Parse Server-Sent Events from ml-gateway /chat/stream.
 * Chunks are JSON-encoded on the wire so tokens may contain newlines safely.
 */
export function decodeSSEDataPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '[DONE]') return '';

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
  } catch {
    /* legacy plain-text chunks */
  }

  return raw;
}

export async function consumeChatSSEStream(
  body: ReadableStream<Uint8Array>,
  onToken: (text: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const eventBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of eventBlock.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.startsWith('data: ') ? line.slice(6) : line.slice(5).trimStart();
        const token = decodeSSEDataPayload(raw);
        if (token) onToken(token);
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const raw = line.startsWith('data: ') ? line.slice(6) : line.slice(5).trimStart();
      const token = decodeSSEDataPayload(raw);
      if (token) onToken(token);
    }
  }
}
