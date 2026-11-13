import { queryTransactions } from '@ai-ledger/schema';
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createChatHandler } from './chat.ts';

export const DEFAULT_MODEL = 'claude-haiku-5-5';

// Messages for body-parser errors; any other client error gets a generic one.
const BODY_ERROR_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'Malformed JSON body',
  'entity.too.large': 'Request body too large',
};

export interface AppOptions {
  /** Language model used by /chat. Injectable so tests can use a mock. */
  model?: LanguageModel;
}

export function createApp({ model = anthropic(DEFAULT_MODEL) }: AppOptions = {}): Express {
  const app: Express = express();

  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    res.send('Hello World!');
  });

  app.post('/queryTransactions', (req: Request, res: Response) => {
    const result = queryTransactions.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid request', issues: result.error.issues });
      return;
    }
    const input = result.data;
    // TODO: query transactions with `input`; echo the normalized query for now.
    res.json(input);
  });

  app.post('/chat', createChatHandler(model));

  // Error handler: must be registered after all routes and keep 4 parameters.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    // Once a response (e.g. an SSE stream) has started, let Express close it.
    if (res.headersSent) {
      next(err);
      return;
    }
    if (isClientError(err)) {
      res
        .status(err.status)
        .json({ error: BODY_ERROR_MESSAGES[err.type] ?? 'Invalid request body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Matches http-errors (as thrown by body-parser) that are safe to report to
 * the client: a 4xx status marked `expose`.
 */
function isClientError(err: unknown): err is { status: number; type: string } {
  if (typeof err !== 'object' || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}
