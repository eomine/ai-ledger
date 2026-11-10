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
