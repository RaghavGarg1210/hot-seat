import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../apps/server/src/app';
import { Store } from '../apps/server/src/store';
import { SAMPLE_PITCH, type Session } from '@hotseat/shared';
let directory: string;
let store: Store;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '');
  directory = mkdtempSync(path.join(tmpdir(), 'hotseat-api-'));
  store = new Store(directory);
  app = createApp(store);
});
afterEach(async () => {
  await app.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const headers = { 'x-hotseat': '1' };
async function sample() {
  return (await app.inject({ method: 'POST', url: '/api/sample', headers })).json<Session>();
}
describe('local API', () => {
  it('supports sample creation, retrieval, export and complete deletion without keys', async () => {
    const s = await sample();
    expect(s.mode).toBe('sample');
    expect((await app.inject(`/api/sessions/${s.id}`)).json().feedback.source).toBe('sample');
    const exported = await app.inject(`/api/sessions/${s.id}/export?format=md`);
    expect(exported.body).toContain('Interest is not a purchase commitment');
    expect(exported.headers['content-disposition']).toContain('.md');
    writeFileSync(store.audioPath(s.id), 'audio');
    store.metric(s.id, { type: 'metric', name: 'reaction', durationMs: 150 });
    const deletion = await app.inject({ method: 'DELETE', url: `/api/sessions/${s.id}`, headers });
    expect(deletion.statusCode).toBe(200);
    expect((await app.inject(`/api/sessions/${s.id}`)).statusCode).toBe(404);
    expect(store.hasAudio(s.id)).toBe(false);
    expect(store.metrics(s.id)).toHaveLength(0);
  });
  it('rejects foreign origins and DNS-rebinding hostnames', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sample',
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/sessions', headers: { host: 'evil.example' } })).statusCode,
    ).toBe(403);
  });
  it('rejects browser-simple writes and unauthenticated worker messages', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/sample' })).statusCode).toBe(403);
    const s = await sample();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/internal/${s.id}/event`,
          payload: { type: 'ready' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('explains unavailable providers instead of fabricating sessions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers,
      payload: { pitch: SAMPLE_PITCH },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('OPENAI_API_KEY');
    expect(store.list()).toHaveLength(0);
  });
  it('refuses recordings without per-session consent', async () => {
    const s = await sample();
    expect(
      (await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/audio`, headers }))
        .statusCode,
    ).toBe(403);
  });
  it('keeps metrics scoped to the requested session', async () => {
    const a = await sample();
    const b = await sample();
    store.metric(a.id, { type: 'metric', name: 'reaction', durationMs: 75 });
    store.metric(b.id, { type: 'metric', name: 'reaction', durationMs: 95 });
    expect(store.metrics(a.id).map((m) => m.duration_ms)).toEqual([75]);
  });
});

describe('provider-backed lifecycle with deterministic provider fixtures', () => {
  it('creates a pitch session, accepts an answer, generates feedback, and links a retry', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const providers = await import('../apps/server/src/providers');
    const context = vi.spyOn(providers, 'preparePitch').mockResolvedValue(SAMPLE_PITCH);
    const objections = vi
      .spyOn(providers, 'prepareObjections')
      .mockResolvedValue([{ persona: 'investor', question: 'Who will pay?' }]);
    const decision = vi.spyOn(providers, 'decide').mockResolvedValue({
      persona: 'investor',
      reaction: 'questioning',
      challenge: true,
      confidence: 0.8,
      source: 'jev',
    });
    const question = vi
      .spyOn(providers, 'question')
      .mockResolvedValue('How will you test willingness to pay?');
    const feedback = vi.spyOn(providers, 'feedback').mockImplementation(async (s) => ({
      source: 'model',
      summary: 'Test your price with real customers.',
      items: [
        {
          id: 'f1',
          kind: 'improvement',
          criterion: 'evidence',
          title: 'Validate willingness to pay',
          detail: 'Your proposed price has not been tested.',
          suggestion: 'Run a paid pilot.',
          turnIds: [s.transcript.find((t) => t.speaker === 'user')!.id],
          questionId: s.transcript[0].id,
        },
      ],
    }));
    try {
      const prepared = await app.inject({
        method: 'POST',
        url: '/api/prepare',
        headers,
        payload: { text: SAMPLE_PITCH.summary },
      });
      expect(prepared.json().name).toBe('Gather');
      const created = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers,
        payload: { pitch: prepared.json(), inputMode: 'text' },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().id;
      await app.inject({
        method: 'POST',
        url: `/api/sessions/${id}/control`,
        headers,
        payload: { action: 'start' },
      });
      const answer = await app.inject({
        method: 'POST',
        url: `/api/sessions/${id}/turn`,
        headers,
        payload: {
          text: 'We have three unpaid pilots and will test pricing next.',
          id: '9a6e0b03-3186-4a27-887d-9b065a9e5088',
        },
      });
      expect(answer.json().transcript).toHaveLength(3);
      const ended = await app.inject({
        method: 'POST',
        url: `/api/sessions/${id}/control`,
        headers,
        payload: { action: 'end' },
      });
      expect(ended.json().status).toBe('completed');
      expect(ended.json().feedback.items[0].criterion).toBe('evidence');
      const retried = await app.inject({
        method: 'POST',
        url: `/api/sessions/${id}/retry`,
        headers,
        payload: { questionId: ended.json().transcript[0].id },
      });
      expect(retried.json().retry.parentSessionId).toBe(id);
      expect(retried.json().retry.originalAnswerIds).toHaveLength(1);
      expect(retried.json().recording).toBe(false);
    } finally {
      [context, objections, decision, question, feedback].forEach((spy) => spy.mockRestore());
    }
  });
});
