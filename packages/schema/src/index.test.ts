import { describe, it, expect } from 'vitest';
import { queryTransactions, renderChartInput, renderChartOutput, proposeBudget } from './index.ts';
import { ZodError } from 'zod';

describe('queryTransactions', () => {
  it('valid object', async () => {
    const object = {
      from: '2026-01-01',
      to: '2026-03-01',
    };
    expect(queryTransactions.parse(object)).toEqual({
      ...object,
      limit: 50,
      sortBy: 'date',
    });
  });

  it('invalid object', async () => {
    const object = {
      fom: '2026-01-01',
      to: '2026-03-01',
    };
    expect(() => queryTransactions.parse(object)).toThrow(ZodError);

    try {
      queryTransactions.parse(object);
    } catch (e) {
      if (e instanceof ZodError) {
        expect(e.issues[0].path[0]).toEqual('from');
      }
    }
  });
});

describe('renderChart input', () => {
  it('valid object', async () => {
    const object = {
      from: '2026-01-01',
      to: '2026-03-01',
      chartType: 'bar',
      groupBy: 'month',
    };
    expect(renderChartInput.parse(object)).toEqual(object);
  });

  it('invalid object', async () => {
    const object = {
      from: '2026-01-01',
      so: '2026-03-01',
      chartType: 'bar',
      groupBy: 'month',
    };
    expect(() => renderChartInput.parse(object)).toThrow(ZodError);

    try {
      renderChartInput.parse(object);
    } catch (e) {
      if (e instanceof ZodError) {
        expect(e.issues[0].path[0]).toEqual('to');
      }
    }
  });
});

describe('renderChart output', () => {
  it('valid object', async () => {
    const object = {
      chartType: 'bar',
      groupBy: 'month',
      series: [{ key: 'key', label: 'Label' }],
      data: [
        { x: 'Jan', groceries: 1000, dining: 1000 },
        { x: 'Feb', groceries: 2000 },
        { x: 'Mar', rent: 30000 },
      ],
    };
    expect(renderChartOutput.parse(object)).toEqual(object);
  });

  it('invalid object', async () => {
    const object = {
      chartType: 'bars',
      groupBy: 'month',
      series: [{ key: 'key', label: 'Label' }],
      data: [
        { x: 'Jan', groceries: 1000, dining: 1000 },
        { x: 'Feb', groceries: 2000 },
        { x: 'Mar', rent: 30000 },
      ],
    };
    expect(() => renderChartOutput.parse(object)).toThrow(ZodError);

    try {
      renderChartOutput.parse(object);
    } catch (e) {
      if (e instanceof ZodError) {
        expect(e.issues[0].path[0]).toEqual('chartType');
      }
    }
  });
});

describe('proposeBudget', () => {
  it('valid object', async () => {
    const object = {
      month: '2026-11',
      limits: [
        { category: 'groceries', amount: 50000, rationale: 'Lorem ipsum' },
        { category: 'dining', amount: 50000, rationale: 'Lorem ipsum' },
      ],
    };
    expect(proposeBudget.parse(object)).toEqual(object);
  });

  it('invalid object', async () => {
    const object = {
      month: '2026-11',
      limits: [
        { category: 'groceries', amount: 50000, rational: 'Lorem ipsum' },
        { category: 'dining', amount: 50000, rationale: 'Lorem ipsum' },
      ],
    };
    expect(() => proposeBudget.parse(object)).toThrow(ZodError);

    try {
      proposeBudget.parse(object);
    } catch (e) {
      if (e instanceof ZodError) {
        expect(e.issues[0].path[0]).toEqual('limits');

        if (e.issues[0].code === 'unrecognized_keys') {
          expect(e.issues[0].keys[0]).toEqual('rational');
        }
      }
    }
  });
});
