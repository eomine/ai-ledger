import { APICallError, type UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  ChatTimeoutError,
  describeChatError,
  toRequestMessages,
  withIdleTimeout,
} from './chat-transport';

const encoder = new TextEncoder();

/** A fetch whose response body is driven by the test. */
function controllableFetch() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let signal: AbortSignal | undefined;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
    cancel: () => {
      cancelled = true;
    },
  });
  let cancelled = false;
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    signal = init?.signal ?? undefined;
    signal?.addEventListener('abort', () => {
      try {
        controller.error(signal!.reason);
      } catch {
        // Already closed.
      }
    });
    return new Response(body, { status: 200, headers: { 'x-test': 'yes' } });
  };
  return {
    fetch,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    get signal() {
      return signal;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the body as the AI SDK does, through its stream. (`Response.text()`
 * would report every stream error as "Failed to fetch".)
 */
async function readBody(response: Response): Promise<string> {
  let text = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body!) text += decoder.decode(chunk);
  return text;
}

describe('withIdleTimeout', () => {
  it('passes the response through while data keeps arriving', async () => {
    const server = controllableFetch();
    const response = await withIdleTimeout(server.fetch, 100)('/chat');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-test')).toBe('yes');

    const text = readBody(response);
    for (const piece of ['a', 'b', 'c']) {
      await sleep(60);
      server.write(piece);
    }
    server.close();
    await expect(text).resolves.toBe('abc');
  });

  it('fails with ChatTimeoutError and aborts the request when the body stalls', async () => {
    const server = controllableFetch();
    const response = await withIdleTimeout(server.fetch, 50)('/chat');
    server.write('partial');

    await expect(readBody(response)).rejects.toBeInstanceOf(ChatTimeoutError);
    expect(server.signal?.aborted).toBe(true);
  });

  it('fails with ChatTimeoutError when no response arrives', async () => {
    const neverResponds: typeof fetch = (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    await expect(withIdleTimeout(neverResponds, 50)('/chat')).rejects.toBeInstanceOf(
      ChatTimeoutError,
    );
  });

  it('propagates a caller abort as an AbortError', async () => {
    const server = controllableFetch();
    const abort = new AbortController();
    const response = await withIdleTimeout(server.fetch, 1000)('/chat', { signal: abort.signal });
    const text = readBody(response);
    abort.abort();
    await expect(text).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates a dropped connection as is', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const dropping: typeof fetch = async () =>
      new Response(new ReadableStream({ start: (c) => void (controller = c) }));
    const response = await withIdleTimeout(dropping, 1000)('/chat');
    const text = readBody(response);
    const dropped = new TypeError('network error');
    controller.error(dropped);
    await expect(text).rejects.toBe(dropped);
  });
});

describe('toRequestMessages', () => {
  it('keeps only non-blank text in assistant messages and drops empty ones', () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'reasoning', text: 'Thinking it over' },
          { type: 'text', text: 'Hello!' },
          { type: 'text', text: '  ' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'And?' }] },
      // Stopped before any text arrived.
      { id: 'a2', role: 'assistant', parts: [{ type: 'step-start' }] },
      { id: 'u3', role: 'user', parts: [{ type: 'text', text: 'Hello?' }] },
    ];

    expect(toRequestMessages(messages)).toEqual([
      messages[0],
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
      messages[2],
      messages[4],
    ]);
  });
});

describe('describeChatError', () => {
  const apiError = (statusCode: number) =>
    new APICallError({
      message: '{"error":"Invalid request","issues":[]}',
      url: '/chat',
      requestBodyValues: undefined,
      statusCode,
    });

  it.each([
    [apiError(400), "The server couldn't process this message."],
    [apiError(413), 'This conversation is too long to send. Reload the page to start a new one.'],
    [apiError(500), 'The server is unavailable right now. Please try again in a moment.'],
    [apiError(502), 'The server is unavailable right now. Please try again in a moment.'],
    [
      new TypeError('Failed to fetch'),
      'Lost connection to the server. Check your connection and try again.',
    ],
    [
      new TypeError('network error'),
      'Lost connection to the server. Check your connection and try again.',
    ],
    [new ChatTimeoutError(10), 'The server stopped responding. Please try again.'],
    [
      new Error('raw provider message'),
      'Something went wrong while generating a response. Please try again.',
    ],
    [
      new TypeError('x is not a function'),
      'Something went wrong while generating a response. Please try again.',
    ],
  ])('describes %s', (error, message) => {
    expect(describeChatError(error)).toBe(message);
  });
});
