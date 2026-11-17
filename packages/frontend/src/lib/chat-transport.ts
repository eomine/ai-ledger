import { APICallError, DefaultChatTransport, type UIMessage } from 'ai';

/** Endpoint served by the backend (proxied by Vite in development). */
export const CHAT_API = '/chat';

/**
 * How long to wait for the next bytes of a response before giving up. Covers
 * connections that die silently (no FIN/RST), where `fetch` would otherwise
 * wait forever. The backend streams reasoning as it goes, so long silences are
 * not expected during normal generation.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/** The response stalled for longer than the idle timeout. */
export class ChatTimeoutError extends Error {
  override name = 'ChatTimeoutError';

  constructor(idleTimeoutMs: number) {
    super(`No data received for ${idleTimeoutMs} ms`);
  }
}

/**
 * Wraps `fetch` so that the request fails with a {@link ChatTimeoutError} when
 * no response (or no further body bytes) arrives within `idleTimeoutMs`. On
 * timeout the underlying connection is aborted.
 */
export function withIdleTimeout(baseFetch: typeof fetch, idleTimeoutMs: number): typeof fetch {
  return async (input, init) => {
    const timeout = new AbortController();
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;

    const headersTimer = setTimeout(
      () => timeout.abort(new ChatTimeoutError(idleTimeoutMs)),
      idleTimeoutMs,
    );
    let response: Response;
    try {
      response = await baseFetch(input, { ...init, signal });
    } catch (error) {
      // fetch rejects with the abort reason, but be explicit for other fetches.
      throw timeout.signal.aborted ? timeout.signal.reason : error;
    } finally {
      clearTimeout(headersTimer);
    }
    if (!response.body) return response;

    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stalled = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ChatTimeoutError(idleTimeoutMs)), idleTimeoutMs);
        });
        try {
          const { done, value } = await Promise.race([reader.read(), stalled]);
          if (done) controller.close();
          else controller.enqueue(value);
        } catch (error) {
          if (error instanceof ChatTimeoutError) timeout.abort(error);
          reader.cancel(error).catch(() => {});
          controller.error(error);
        } finally {
          clearTimeout(timer);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/**
 * Prepares the conversation history for the backend. Assistant replies keep
 * only their non-blank text: reasoning from a reply that was cut short has no
 * signature and would be rejected by the provider, and a reply stopped before
 * any text would become an empty assistant turn.
 */
export function toRequestMessages(messages: UIMessage[]): UIMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant') return [message];
    const parts = message.parts.filter((part) => part.type === 'text' && part.text.trim() !== '');
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}

function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export interface ChatTransportOptions {
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  idleTimeoutMs?: number;
}

export function createChatTransport({
  fetch: baseFetch = (input, init) => globalThis.fetch(input, init),
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: ChatTransportOptions = {}) {
  return new DefaultChatTransport({
    api: CHAT_API,
    fetch: withIdleTimeout(baseFetch, idleTimeoutMs),
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
      body: {
        id,
        trigger,
        messageId,
        messages: toRequestMessages(messages),
        timeZone: currentTimeZone(),
      },
    }),
  });
}

/** Mirrors the AI SDK's own check for a dropped connection. */
function isNetworkError(error: Error): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return message.includes('fetch') || message.includes('network') || message === 'load failed';
}

/**
 * Turns a chat error into a message for the user. Server-provided text is
 * never shown as-is: it may be a raw validation error or provider message.
 */
export function describeChatError(error: Error): string {
  if (error instanceof ChatTimeoutError) {
    return 'The server stopped responding. Please try again.';
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 413) {
      return 'This conversation is too long to send. Reload the page to start a new one.';
    }
    if (status >= 400 && status < 500) {
      return "The server couldn't process this message.";
    }
    return 'The server is unavailable right now. Please try again in a moment.';
  }
  if (isNetworkError(error)) {
    return 'Lost connection to the server. Check your connection and try again.';
  }
  return 'Something went wrong while generating a response. Please try again.';
}
