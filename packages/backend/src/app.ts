import { queryTransactions } from '@ai-ledger/schema';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

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

// Error handler: must be registered after all routes and keep 4 parameters.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (isBodyParseError(err)) {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed'
  );
}

export default app;
