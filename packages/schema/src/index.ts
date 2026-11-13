import z from 'zod';

import { CATEGORIES } from './categories.ts';

export const queryTransactions = z
  .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    categories: z.array(z.enum(CATEGORIES)).optional(),
    merchants: z.array(z.string()).optional(),
    sortBy: z.enum(['date', 'amount']).default('date'),
    limit: z.number().int().positive().max(200).default(50),
  })
  .refine((object) => object.from <= object.to);

export const renderChartInput = z
  .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    categories: z.array(z.enum(CATEGORIES)).optional(),
    merchants: z.array(z.string()).optional(),
    chartType: z.enum(['bar', 'line', 'pie']),
    groupBy: z.enum(['month', 'category', 'merchant']),
    seriesBy: z.enum(['month', 'category', 'merchant']).optional(), // invalidate if equal to groupBy
  })
  .refine((object) => object.from <= object.to);

export const renderChartOutput = z
  .strictObject({
    chartType: z.enum(['bar', 'line', 'pie']),
    groupBy: z.enum(['month', 'category', 'merchant']),
    seriesBy: z.enum(['month', 'category', 'merchant']).optional(),
    series: z.array(
      z.strictObject({
        key: z.string(),
        label: z.string(),
      }),
    ),
    data: z.array(
      z
        .strictObject({
          x: z.string(),
        })
        .catchall(z.number()),
    ),
  })
  .refine((object) => object.groupBy !== object.seriesBy);

export const proposeBudget = z.strictObject({
  month: z.string(), // .regex() YYYY-MM
  limits: z.array(
    z.strictObject({
      category: z.enum(CATEGORIES),
      amount: z.int().positive(), // cents
      rationale: z.string().optional(),
    }),
  ),
});

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Body of POST /chat, as sent by the AI SDK's `useChat` default transport.
 * Unknown keys (e.g. `id`, `messageId`, extra `body` fields) are stripped.
 * The structure of each message is validated by the backend with the AI SDK's
 * `validateUIMessages`; this schema only bounds the request.
 *
 * `timeZone` is an extra field the frontend adds through useChat's `body`
 * option (`Intl.DateTimeFormat().resolvedOptions().timeZone`), so "today"
 * matches the user's calendar. Defaults to UTC.
 */
export const chatRequest = z.object({
  // The chat history is never rewritten, so regenerating a reply is not supported.
  trigger: z.literal('submit-message').optional(),
  messages: z.array(z.unknown()).min(1).max(100),
  timeZone: z.string().refine(isTimeZone, 'Invalid IANA time zone').optional(),
});

/** Maximum length of the text a user sends in one message. */
export const MAX_USER_MESSAGE_CHARS = 10_000;
