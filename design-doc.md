# AI Ledger

# Context

Given a sample data of bank expenses, a user should be able to request data and
perform actions using an agentic UI.

# Goals

## User capabilities
- Users should be able to query expenses using AI, e.g., "How much did I spend
on groceries last month?"
- Users should be able to generate custom charts, e.g. "Generate a chart
comparing my groceries expenses in the last 3 months"
- Users should be able to ask for budget suggestions, e.g. "Help me spend less
on groceries"

## Engineering qualities
- Token streaming with stop/abort.
- Tool calls rendered as components.
- Error states and recovery:
  - mid-stream drop: keep the partial message and show a retry button.
  - rate limit: show a countdown timer until a retry is allowed.
  - malformed tool results: show an error message.
  - user abortion: show a message stating that the user aborted.
- Deterministic replay tests (fixtures recorded from real sessions).
- User-created budgets persisted locally with localStorage.

# Non-goals

- No bank integration: the purpose of this project is the agentic UI, not data
integration.
- No accounts (sign up / log in): additional complexity for a portfolio project.
- No real financial advice.
- No SSR or SEO: it's a web application, not an indexable content page.
- No components from scratch: focus on the AI interaction, use shadcn.
- No changing LLMs: for simplicity, only support Claude for now (only exception
for deterministic replay tests which will require mocking the LLM).
- No rewriting chat history: no state management, no need to save previous
versions of the chat.

# Stack

## Frontend

- React: most used framework.
- TypeScript: improves code quality and safety.
- Vite: modern build tool.
- Oxlint and Oxfmt: linting and formatter from the Vite+ ecosystem.
- Zod: schema validation, can be used on the Node.js backend as well.
- Recharts: popular charting library.
- Vitest, RTL, MSW, Playwright: testing.
- pnpm workspace: to enable sharing code with the backend app.

## Backend

- Node.js: server-side JavaScript allows sharing code with the frontend.
- Express: most used framework.
- TypeScript: improves code quality and safety.
- Zod: schemas can be shared with the frontend.
- Data storage: static JSON file (note: dates should be defined as relative to
now, to avoid empty results as the data ages).

## AI

- Vercel AI SDK (latest, v7) for tool calling.
- Vercel Firewall (WAF): rate limiting to prevent abuse. Simpler to implement
than @upstash/ratelimit which requires a Redis store.
- Claude Haiku 5.5: good for quick tasks.

## CI

- GitHub Actions.

## Hosting

- Vercel.

# Milestones

1. Monorepo scaffold and CI.
2. Data and queryTransactions, with streaming chat.
3. renderChart.
4. proposeBudget with the approval flow.
5. Error states.
6. Replay tests and deploy.

# Tools

```typescript
import { tool } from "ai";
import { z } from "zod";

const CATEGORIES = ['groceries', 'dining', 'health', 'shopping', 'transportation', 'rent', 'fun', 'other'] as const;

type Category = typeof CATEGORIES[number];

type Transaction = {
  id: number;
  daysAgo: number; // convert to Date when loaded in the app
  category: Category;
  merchant: string;
  amount: number; // cents, i.e., 3456 means $34.56
}

const queryTransactions = tool({
  description: 'Query the user\'s transactions, filtering by date, categories, merchants.',
  inputSchema: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    categories: z.array(z.enum(CATEGORIES)).optional(),
    merchants: z.array(z.string()).optional(),
    sortBy: z.enum(['date', 'amount']).default('date'),
    limit: z.number().int().positive().max(200).default(50),
  }),
  execute: async ({ from, to, categories, merchants, sortBy, limit }) => {
    const allRows = db.filter(/*...*/);
    return {
      rows: allRows.sort(sortBy).slice(0, limit),
      count: allRows.length,
      total: allRows.reduce(),
    };
  },
});

const renderChart = tool({
  description: 'Render a chart, filtering by date, categories, merchants.',
  inputSchema: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    categories: z.array(z.enum(CATEGORIES)).optional(),
    merchants: z.array(z.string()).optional(),
    chartType: z.enum(['bar', 'line', 'pie']),
    groupBy: z.enum(['month', 'category', 'merchant']),
    seriesBy: z.enum(['month', 'category', 'merchant']).optional(), // invalidate if equal to groupBy
  }),
  outputSchema: z.object({
    chartType: z.enum(['bar', 'line', 'pie']),
    groupBy: z.enum(['month', 'category', 'merchant']),
    seriesBy: z.enum(['month', 'category', 'merchant']).optional(),
    series: z.array(z.object({
      key: z.string(),
      label: z.string(),
    })),
    data: z.array(z.object({
      x: z.string(),
    }).catchall(z.number())),
  }),
  execute: async ({ from, to, categories, merchants, chartType, groupBy, seriesBy }) => {
    return {
      chartType,
      groupBy,
      seriesBy,
      // series,
      // data,
    };
  },
});

const proposeBudget = tool({
  description: 'Draft a monthly budget. The user must approve it before it is saved to localStorage.',
  inputSchema: z.object({
    month: z.string(), // .regex() YYYY-MM
    limits: z.array(z.object({
      category: z.enum(CATEGORIES),
      amount: z.int().positive(), // cents
      rationale: z.string().optional(),
    })),
  }),
  // no execute: the client renders the approval form and returns the user's decision
})
```

# Notes

- Calling the AI model via API requires injecting the current date in the
request.
