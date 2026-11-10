import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app.ts';

describe('GET /', () => {
  it("should return 'Hello World!'", async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toEqual('Hello World!');
  });
});

describe('POST /queryTransactions', () => {
  const valid = { from: '2026-01-01', to: '2026-03-01' };

  it('returns the normalized query with defaults applied', async () => {
    const res = await request(app).post('/queryTransactions').send(valid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...valid, limit: 50, sortBy: 'date' });
  });

  it.each([
    ['missing required keys', { abc: '2026-01-01', def: '2026-03-01' }, 'from'],
    ['bad date format', { ...valid, from: '01/01/2026' }, 'from'],
    ['wrong type', { ...valid, limit: '10' }, 'limit'],
    ['limit above 200', { ...valid, limit: 201 }, 'limit'],
    ['unknown key', { ...valid, categoryz: ['dining'] }, undefined],
  ])('rejects %s with 400 and Zod issues', async (_name, body, field) => {
    const res = await request(app).post('/queryTransactions').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual('Invalid request');
    expect(res.body.issues.length).toBeGreaterThan(0);
    if (field) {
      expect(res.body.issues[0].path[0]).toEqual(field);
    }
  });

  it('rejects an inverted date range with 400', async () => {
    const res = await request(app)
      .post('/queryTransactions')
      .send({ from: '2026-03-01', to: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual('Invalid request');
  });

  it('rejects malformed JSON with a 400 JSON error and no stack trace', async () => {
    const res = await request(app)
      .post('/queryTransactions')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.type).toEqual('application/json');
    expect(res.body).toEqual({ error: 'Malformed JSON body' });
    expect(res.text).not.toContain('node_modules');
  });
});
