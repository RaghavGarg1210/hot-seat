import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  type Session,
  type SessionEvent,
  type Persona,
  type Control,
  type PanelDecision,
} from '@hotseat/shared';
import type { Store } from './store.js';
import * as providers from './providers.js';

export type WorkerCommand =
  | { type: 'speak'; text: string; persona: Persona; turnId: string; generation: number }
  | { type: 'cancel' }
  | { type: 'input'; enabled: boolean }
  | { type: 'close' };
export const POLICY = {
  supportive: { opening: 30000, cooldown: 30000, interrupt: false },
  challenging: { opening: 30000, cooldown: 25000, interrupt: true },
  intense: { opening: 15000, cooldown: 12000, interrupt: true },
};
export class Controller extends EventEmitter {
  voiceReady = false;
  private partialText = '';
  private revision = 0;
  private decisionVersion = 0;
  private generation = new AbortController();
  private lastChallenge = -Infinity;
  private lastPartialAt = 0;
  private clock = 0;
  private timer?: ReturnType<typeof setInterval>;
  private answering = false;
  private seen = new Set<string>();
  private commandId = 0;
  private commands: { id: number; command: WorkerCommand }[] = [];
  private closed = false;
  constructor(
    public session: Session,
    private store: Store,
    private deps = providers,
  ) {
    super();
  }
  emitEvent(event: SessionEvent) {
    if (this.closed) return;
    this.emit('event', event);
    if (event.type === 'metric') this.store.metric(this.session.id, event);
  }
  private save() {
    if (!this.closed) this.store.save(this.session);
  }
  private command(command: WorkerCommand) {
    this.commands.push({ id: ++this.commandId, command });
    this.commands = this.commands.slice(-100);
  }
  resetVoiceConnection() {
    this.cancel();
    this.commands = [];
    this.voiceReady = false;
    this.partialText = '';
  }
  poll(after: number) {
    return this.commands.filter((c) => c.id > after);
  }
  private updateClock() {
    if (this.session.status === 'active') {
      const now = Date.now();
      this.session.elapsedMs += now - this.clock;
      this.clock = now;
    }
  }
  private state() {
    this.save();
    this.emitEvent({
      type: 'state',
      status: this.session.status,
      elapsedMs: this.session.elapsedMs,
    });
  }
  cancel() {
    this.revision++;
    this.decisionVersion++;
    this.generation.abort();
    this.generation = new AbortController();
    this.answering = false;
    this.command({ type: 'cancel' });
    this.emitEvent({ type: 'speaker', persona: null });
  }
  addTurn(speaker: 'user' | Persona, text: string, id: string = randomUUID()) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    const turn = { id, speaker, text, at: this.session.elapsedMs };
    this.session.transcript.push(turn);
    this.save();
    this.emitEvent({ type: 'transcript', turn });
    return turn;
  }
  speak(persona: Persona, text: string) {
    if (this.session.status !== 'active') return;
    this.lastChallenge = this.session.elapsedMs;
    const turn = this.addTurn(persona, text);
    if (!turn) return;
    if (this.session.inputMode === 'text') this.emitEvent({ type: 'speaker', persona });
    this.command({ type: 'speak', persona, text, turnId: turn.id, generation: this.revision });
  }
  async control(action: Control) {
    if (this.closed || this.session.status === 'completed') return;
    this.updateClock();
    if (action === 'start' || action === 'resume') {
      if (this.session.status === 'active') return;
      const first = this.session.status === 'ready';
      this.session.status = 'active';
      this.clock = Date.now();
      this.command({ type: 'input', enabled: true });
      this.state();
      if (!this.timer)
        this.timer = setInterval(() => {
          this.updateClock();
          this.state();
          if (this.session.elapsedMs >= this.session.duration * 60000) void this.control('end');
        }, 1000);
      if (first) {
        const initial = this.session.retry ? this.session.objections[0] : undefined;
        this.speak(
          initial?.persona || 'investor',
          initial?.question ||
            `Welcome to HotSeat. Tell us about ${this.session.pitch.name}: what problem are you solving, and for whom?`,
        );
      }
    } else if (action === 'pause') {
      this.cancel();
      this.session.status = 'paused';
      this.command({ type: 'input', enabled: false });
      this.state();
    } else if (action === 'end') {
      this.cancel();
      this.session.status = 'completed';
      clearInterval(this.timer);
      this.command({ type: 'close' });
      this.state();
      await this.generateFeedback();
    } else if (action === 'text') {
      this.cancel();
      this.session.inputMode = 'text';
      this.command({ type: 'close' });
      this.save();
    } else if (action === 'interrupt') {
      this.cancel();
    } else if (action === 'skip') {
      this.cancel();
      await this.ask(this.nextPersona(), true);
    }
  }
  private nextPersona(): Persona {
    const last = this.session.transcript.filter((t) => t.speaker !== 'user').at(-1)?.speaker;
    return last === 'investor' ? 'customer' : last === 'customer' ? 'operator' : 'investor';
  }
  async userTurn(text: string, id: string) {
    if (this.session.status !== 'active' || this.seen.has(id) || !text.trim()) return;
    this.updateClock();
    this.cancel();
    this.addTurn('user', text.trim(), id);
    this.partialText = '';
    const revision = this.revision;
    const decision = await this.evaluate(text);
    if (this.closed || revision !== this.revision || this.session.status !== 'active') return;
    // Opening protection applies to mid-speech interruptions, not completed answers.
    await this.ask(decision?.persona || this.nextPersona(), true);
  }
  async partial(text: string) {
    if (
      this.session.status !== 'active' ||
      text.length < 35 ||
      Date.now() - this.lastPartialAt < 650
    )
      return;
    this.lastPartialAt = Date.now();
    this.partialText = text;
    const revision = this.revision;
    const decision = await this.evaluate(text);
    if (
      revision !== this.revision ||
      !decision ||
      decision.source !== 'jev' ||
      decision.confidence < 0.7 ||
      !decision.challenge
    )
      return;
    const policy = POLICY[this.session.pressure];
    this.updateClock();
    if (
      policy.interrupt &&
      this.session.elapsedMs >= policy.opening &&
      this.session.elapsedMs - this.lastChallenge >= policy.cooldown &&
      !this.answering
    )
      await this.ask(decision.persona);
  }
  private async evaluate(text: string): Promise<PanelDecision | undefined> {
    const version = ++this.decisionVersion;
    const began = Date.now();
    let decision: PanelDecision;
    try {
      decision = await this.deps.decide(this.session, text, this.generation.signal);
    } catch {
      if (this.generation.signal.aborted) return;
      decision = this.deps.baselineDecision(text);
    }
    if (version !== this.decisionVersion || this.closed || this.session.status !== 'active') return;
    const latencyMs = Date.now() - began;
    this.emitEvent({ type: 'reaction', decision, latencyMs });
    this.emitEvent({ type: 'metric', name: 'reaction', durationMs: latencyMs });
    if (decision.source === 'baseline')
      this.emitEvent({
        type: 'notice',
        degraded: true,
        message: 'Jev is unavailable. Continuing with questions at turn boundaries.',
      });
    return decision;
  }
  async ask(persona: Persona, force = false) {
    if (this.answering || this.session.status !== 'active') return;
    if (!force && this.session.elapsedMs - this.lastChallenge < 2000) return;
    this.answering = true;
    const revision = this.revision;
    const signal = this.generation.signal;
    try {
      const text = await this.deps.question(
        this.partialText
          ? {
              ...this.session,
              transcript: [
                ...this.session.transcript,
                {
                  id: 'in-progress',
                  speaker: 'user',
                  text: this.partialText,
                  at: this.session.elapsedMs,
                },
              ],
            }
          : this.session,
        persona,
        signal,
      );
      if (revision === this.revision && !signal.aborted) this.speak(persona, text);
    } catch {
      if (!signal.aborted) {
        this.emitEvent({
          type: 'notice',
          degraded: true,
          message:
            'Question generation failed. Check your provider key or connection, then resume.',
        });
        await this.control('pause');
      }
    } finally {
      if (revision === this.revision) this.answering = false;
    }
  }
  async generateFeedback() {
    if (this.session.feedback) return;
    if (!this.session.transcript.some((t) => t.speaker === 'user')) {
      this.session.feedbackError =
        'No answer was captured. Start another session to receive feedback.';
      this.save();
      return;
    }
    try {
      this.session.feedback = await this.deps.feedback(this.session);
      this.session.feedbackError = null;
      this.save();
      this.emitEvent({ type: 'feedback', feedback: this.session.feedback });
    } catch {
      this.session.feedbackError =
        'Feedback could not be generated. Check the provider configuration and retry.';
      this.save();
      this.emitEvent({ type: 'notice', message: this.session.feedbackError, degraded: true });
    }
  }
  voiceError() {
    this.voiceReady = false;
    this.partialText = '';
    void this.control('pause');
    this.emitEvent({
      type: 'notice',
      message: 'Voice connection stopped. Reconnect or continue in text.',
      degraded: true,
    });
  }
  dispose() {
    this.closed = true;
    this.generation.abort();
    clearInterval(this.timer);
    this.command({ type: 'close' });
    this.removeAllListeners();
  }
}
