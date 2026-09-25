import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Session, type PanelDecision } from '@hotseat/shared';
import { Store } from '../apps/server/src/store';
import { Controller } from '../apps/server/src/controller';
import { sampleSession } from '../apps/server/src/sample';
import * as providers from '../apps/server/src/providers';
let store: Store;
let directory: string;
let controllers: Controller[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  directory = mkdtempSync(path.join(tmpdir(), 'hotseat-test-'));
  store = new Store(directory);
});
afterEach(() => {
  controllers.forEach((c) => c.dispose());
  controllers = [];
  store.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});
const decision: PanelDecision = {
  persona: 'investor',
  reaction: 'skeptical',
  challenge: true,
  confidence: 0.9,
  source: 'jev',
};
function create(
  overrides: Partial<typeof providers> = {},
  pressure: Session['pressure'] = 'challenging',
) {
  const session = {
    ...sampleSession(),
    id: randomUUID(),
    status: 'ready' as const,
    mode: 'live' as const,
    pressure,
    transcript: [],
    feedback: null,
    elapsedMs: 0,
  };
  const deps = {
    ...providers,
    decide: vi.fn().mockResolvedValue(decision),
    question: vi.fn().mockResolvedValue('What evidence do you have that customers will pay?'),
    feedback: vi.fn().mockResolvedValue({ summary: 'Review', items: [], source: 'model' }),
    ...overrides,
  };
  const c = new Controller(session, store, deps);
  controllers.push(c);
  return { c, deps };
}
describe('conversation ownership', () => {
  it('never replays old speech commands after reconnecting', async () => {
    const { c } = create();
    await c.control('start');
    expect(c.poll(0).some((e) => e.command.type === 'speak')).toBe(true);
    c.voiceReady = true;
    c.resetVoiceConnection();
    expect(c.poll(0)).toEqual([]);
    expect(c.voiceReady).toBe(false);
  });
  it('deduplicates submitted turns and produces one follow-up', async () => {
    const { c, deps } = create();
    await c.control('start');
    await c.userTurn('We interviewed eighteen shop owners.', 'one');
    await c.userTurn('We interviewed eighteen shop owners.', 'one');
    expect(c.session.transcript.filter((t) => t.speaker === 'user')).toHaveLength(1);
    expect(deps.question).toHaveBeenCalledTimes(1);
  });
  it('discards a generated response after the user takes the floor', async () => {
    let resolve!: (text: string) => void;
    const { c } = create({
      question: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await c.control('start');
    const pending = c.userTurn('We have a clear business model.', 'a');
    await vi.advanceTimersByTimeAsync(1);
    c.cancel();
    resolve('This stale question must never be spoken.');
    await pending;
    expect(c.session.transcript.some((t) => t.text.includes('stale'))).toBe(false);
  });
  it('does not act on decisions resolved after pause', async () => {
    let resolve!: (value: PanelDecision) => void;
    const { c } = create({
      decide: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await c.control('start');
    const events: unknown[] = [];
    c.on('event', (e) => events.push(e));
    const pending = c.userTurn('We will dominate this market.', 'a');
    await c.control('pause');
    resolve(decision);
    await pending;
    expect(events.some((e) => (e as { type: string }).type === 'reaction')).toBe(false);
  });
  it('protects the opening and never interrupts supportive sessions', async () => {
    for (const pressure of ['supportive', 'challenging', 'intense'] as const) {
      const { c, deps } = create({}, pressure);
      await c.control('start');
      await c.partial('A long unsupported claim that everyone will buy our product.');
      expect(deps.question).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60000);
      await c.partial('Another long unsupported claim that everyone will buy our product.');
      expect(deps.question).toHaveBeenCalledTimes(pressure === 'supportive' ? 0 : 1);
    }
  });
  it('falls back without interrupting when Jev fails', async () => {
    const { c, deps } = create(
      { decide: vi.fn().mockRejectedValue(new Error('timeout')) },
      'intense',
    );
    await c.control('start');
    await vi.advanceTimersByTimeAsync(30000);
    await c.partial('We will easily take over the entire worldwide market.');
    expect(deps.question).not.toHaveBeenCalled();
    await c.userTurn('We need to validate this assumption.', 'b');
    expect(deps.question).toHaveBeenCalledOnce();
  });
  it('freezes elapsed time while paused and expires at the session limit', async () => {
    const { c } = create();
    await c.control('start');
    await vi.advanceTimersByTimeAsync(5000);
    await c.control('pause');
    await vi.advanceTimersByTimeAsync(10000);
    expect(c.session.elapsedMs).toBe(5000);
    await c.control('resume');
    await vi.advanceTimersByTimeAsync(8 * 60000);
    expect(c.session.status).toBe('completed');
  });
  it('cannot resurrect deleted state after pending feedback resolves', async () => {
    let resolve!: (f: Awaited<ReturnType<typeof providers.feedback>>) => void;
    const { c } = create({
      feedback: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    c.addTurn('user', 'Some evidence', 'e');
    const pending = c.generateFeedback();
    c.dispose();
    store.remove(c.session.id);
    resolve({ summary: 'Review', items: [], source: 'model' });
    await pending;
    expect(store.get(c.session.id)).toBeUndefined();
  });
});
describe('evidence references', () => {
  it('rejects feedback with invented references', () => {
    const s = sampleSession();
    const f = s.feedback!;
    expect(() =>
      providers.validateFeedback({ ...f, items: [{ ...f.items[0], turnIds: ['invented'] }] }, s),
    ).toThrow('valid transcript evidence');
  });
  it('does not treat a question alone as evidence of an answer', () => {
    const s = sampleSession();
    expect(() =>
      providers.validateFeedback(
        { ...s.feedback!, items: [{ ...s.feedback!.items[0], turnIds: ['sample-1'] }] },
        s,
      ),
    ).toThrow();
  });
  it('retains exact valid source IDs', () => {
    const s = sampleSession();
    expect(providers.validateFeedback(s.feedback!, s).items).toHaveLength(3);
  });
});
