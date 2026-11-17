import { vi } from 'vitest';

/** A request received by {@link FakeChatServer}. */
export interface FakeRequest {
  url: string;
  // oxlint-disable-next-line typescript/no-explicit-any -- parsed JSON
  body: any;
  signal: AbortSignal;
}

/**
 * A streaming reply to one request, written chunk by chunk by the test using
 * the AI SDK UI message stream protocol (SSE).
 */
export class FakeReply {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private textId = 0;
  readonly request: FakeRequest;
  readonly response: Response;

  constructor(request: FakeRequest) {
    this.request = request;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    // A real fetch errors the body when its signal aborts.
    request.signal.addEventListener('abort', () => {
      try {
        this.controller.error(request.signal.reason);
      } catch {
        // Already closed.
      }
    });
    this.response = new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    });
  }

  private write(data: string) {
    this.controller.enqueue(this.encoder.encode(`data: ${data}\n\n`));
  }

  send(chunk: object) {
    this.write(JSON.stringify(chunk));
  }

  /** Starts the message and its first step. */
  start() {
    this.send({ type: 'start' });
    this.send({ type: 'start-step' });
  }

  /** Streams a complete text part made of `deltas`. */
  text(...deltas: string[]) {
    const id = `t${++this.textId}`;
    this.send({ type: 'text-start', id });
    for (const delta of deltas) this.send({ type: 'text-delta', id, delta });
    this.send({ type: 'text-end', id });
  }

  /** Ends the reply normally, as the backend does. */
  finish(finishReason = 'stop') {
    this.send({ type: 'finish-step' });
    this.send({ type: 'finish', finishReason });
    this.write('[DONE]');
    this.close();
  }

  /** Sends an error chunk and ends the stream, as the backend does on failure. */
  fail(errorText = 'Something went wrong while generating a response.') {
    this.send({ type: 'error', errorText });
    this.write('[DONE]');
    this.close();
  }

  /** Closes the stream cleanly, possibly before a `finish` chunk. */
  close() {
    this.controller.close();
  }

  /** Drops the connection mid-stream, as fetch does on a network failure. */
  drop() {
    this.controller.error(new TypeError('network error'));
  }
}

type Handler = (request: FakeRequest) => Response | Promise<Response>;

/**
 * Stands in for the backend's POST /chat. By default each request gets a
 * {@link FakeReply} that the test drives; `respondOnce` overrides the next one.
 */
export class FakeChatServer {
  readonly replies: FakeReply[] = [];
  readonly requests: FakeRequest[] = [];
  private readonly handlers: Handler[] = [];

  readonly fetch: typeof fetch = async (input, init) => {
    const request: FakeRequest = {
      url: input instanceof Request ? input.url : String(input),
      body: JSON.parse(String(init?.body)),
      signal: init?.signal ?? new AbortController().signal,
    };
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (handler) return handler(request);
    const reply = new FakeReply(request);
    this.replies.push(reply);
    return reply.response;
  };

  /** Handles the next request with `handler` instead of a streaming reply. */
  respondOnce(handler: Handler) {
    this.handlers.push(handler);
  }

  /** Waits for the nth (0-based) streaming reply to be requested. */
  async reply(index: number): Promise<FakeReply> {
    await vi.waitFor(() => {
      if (!this.replies[index]) throw new Error(`Reply ${index} not requested yet`);
    });
    return this.replies[index]!;
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
