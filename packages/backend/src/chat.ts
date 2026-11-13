import { chatRequest, MAX_USER_MESSAGE_CHARS } from '@ai-ledger/schema';
import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import type { Request, Response } from 'express';

const ERROR_MESSAGE = 'Something went wrong while generating a response.';

// Generous enough that replies (thinking included) aren't cut off, while
// bounding the cost of a single request.
const MAX_OUTPUT_TOKENS = 16_000;

// Haiku 5.5's default effort, set explicitly so cost and latency don't shift
// if the provider default changes. Try 'low' once replies can be evaluated.
const anthropicOptions = { effort: 'medium' } satisfies AnthropicLanguageModelOptions;

function systemPrompt(now: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  return `You are AI Ledger, an assistant that helps users understand their personal expenses. Today's date is ${today} (${timeZone}).`;
}

/**
 * Checks what `validateUIMessages` doesn't: the client may only send user and
 * assistant turns (system instructions come from the server), and the
 * conversation must end with a non-blank user message of bounded length.
 * Returns an error message, or undefined if the conversation is acceptable.
 */
function checkConversation(messages: UIMessage[]): string | undefined {
  if (messages.some((message) => message.role === 'system')) {
    return 'System messages are not allowed';
  }
  const last = messages.at(-1)!;
  if (last.role !== 'user') {
    return 'The last message must be from the user';
  }
  const text = last.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
  if (text.length === 0) {
    return 'The last message must contain text';
  }
  if (text.length > MAX_USER_MESSAGE_CHARS) {
    return `The last message must be at most ${MAX_USER_MESSAGE_CHARS} characters`;
  }
  return undefined;
}

function invalidRequest(res: Response, issues: unknown[]) {
  res.status(400).json({ error: 'Invalid request', issues });
}

function messagesIssue(message: string) {
  return [{ path: ['messages'], message }];
}

/**
 * Creates a handler for the AI SDK `useChat` default transport: it takes the
 * conversation's UI messages and streams the reply back as an AI SDK UI message
 * stream (SSE).
 */
export function createChatHandler(model: LanguageModel) {
  return async (req: Request, res: Response) => {
    const body = chatRequest.safeParse(req.body);
    if (!body.success) {
      invalidRequest(res, body.error.issues);
      return;
    }
    const validated = await safeValidateUIMessages({ messages: body.data.messages });
    if (!validated.success) {
      invalidRequest(res, messagesIssue(validated.error.message));
      return;
    }
    const messages = validated.data;
    const problem = checkConversation(messages);
    if (problem) {
      invalidRequest(res, messagesIssue(problem));
      return;
    }

    // Stop generating (and paying for tokens) when the client goes away.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    const { stream } = streamText({
      model,
      system: systemPrompt(new Date(), body.data.timeZone ?? 'UTC'),
      messages: await convertToModelMessages(messages),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: { anthropic: anthropicOptions },
      abortSignal: abort.signal,
    });

    await pipeUIMessageStreamToResponse({
      response: res,
      stream: toUIMessageStream({
        stream,
        originalMessages: messages,
        onError: (error) => {
          console.error('Chat stream error:', error);
          return ERROR_MESSAGE;
        },
      }),
    });
  };
}
