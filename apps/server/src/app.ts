import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { createReadStream, writeFileSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { CreateSession, Control, SessionEvent, Persona, type Session } from '@hotseat/shared';
import { Store } from './store.js';
import { Controller } from './controller.js';
import * as providers from './providers.js';
import { sampleSession } from './sample.js';
import { extractPdf } from './pdf.js';

export function createApp(store: Store) {
  const app = Fastify({ bodyLimit: 1024 * 1024, logger: false });
  const controllers = new Map<string, Controller>();
  const streams = new Set<ServerResponse>();
  const origins = (
    process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000'
  ).split(',');
  app.register(cors, { origin: origins });
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  function controller(id: string) {
    const existing = controllers.get(id);
    if (existing) return existing;
    const session = store.get(id);
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    const c = new Controller(session, store);
    controllers.set(id, c);
    return c;
  }
  function sessionId(params: unknown) {
    return z.object({ id: z.string().uuid() }).parse(params).id;
  }
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    const host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1', 'server', 'livekit'].includes(host))
      return reply.code(403).send({ error: 'Host not allowed' });
    if (origin && !origins.includes(origin))
      return reply.code(403).send({ error: 'Origin not allowed' });
    if (req.url.startsWith('/api/internal/')) {
      const expected = process.env.INTERNAL_TOKEN || '';
      const actual = req.headers.authorization?.replace(/^Bearer /, '') || '';
      if (
        expected.length < 32 ||
        actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      )
        return reply.code(401).send({ error: 'Worker authentication required' });
    } else if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-hotseat'] !== '1')
      return reply.code(403).send({ error: 'Missing request header' });
  });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error & { statusCode?: number; code?: string };
    const status =
      e instanceof ZodError
        ? 400
        : e.statusCode || (e.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 500);
    reply.code(status).send({
      error:
        status < 500
          ? e.message
          : 'The request could not be completed. Check provider configuration and try again.',
    });
  });
  app.get('/api/health', async () => ({ status: 'ok', providers: providers.providerStatus() }));
  app.post('/api/prepare', async (req) => {
    const { text } = z.object({ text: z.string().trim().min(20).max(120000) }).parse(req.body);
    return providers.preparePitch(text, []);
  });
  app.post('/api/prepare/pdf', async (req, reply) => {
    const file = await req.file();
    if (!file || file.mimetype !== 'application/pdf')
      return reply.code(400).send({ error: 'Upload a PDF document.' });
    try {
      const pages = await extractPdf(new Uint8Array(await file.toBuffer()));
      return await providers.preparePitch(
        pages.map((p) => `Page ${p.page}: ${p.text}`).join('\n'),
        pages,
      );
    } catch (error) {
      return reply.code(422).send({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to read this PDF. Paste a brief instead.',
      });
    }
  });
  app.get('/api/sessions', async () =>
    store.list().map(({ id, createdAt, pitch, status, pressure, duration, mode, elapsedMs }) => ({
      id,
      createdAt,
      name: pitch.name,
      status,
      pressure,
      duration,
      mode,
      elapsedMs,
    })),
  );
  app.post('/api/sample', async () => {
    const sample = sampleSession();
    store.save(sample);
    return sample;
  });
  app.post('/api/sessions', async (req, reply) => {
    if (!providers.providerStatus().openai)
      return reply.code(503).send({
        error:
          'Add OPENAI_API_KEY to .env and restart to practice live. The sample replay works without keys.',
      });
    const input = CreateSession.parse(req.body);
    const objections = await providers.prepareObjections(input.pitch);
    const session: Session = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
      status: 'ready',
      mode: 'live',
      audioAvailable: false,
      elapsedMs: 0,
      transcript: [],
      feedback: null,
      feedbackError: null,
      retry: null,
      objections,
    };
    store.save(session);
    return session;
  });
  app.get('/api/sessions/:id', async (req) => controller(sessionId(req.params)).session);
  app.post('/api/sessions/:id/control', async (req) => {
    const c = controller(sessionId(req.params));
    const { action } = z.object({ action: Control }).parse(req.body);
    if (c.session.mode === 'sample') return c.session;
    await c.control(action);
    return c.session;
  });
  app.post('/api/sessions/:id/turn', async (req) => {
    const c = controller(sessionId(req.params));
    if (c.session.mode === 'sample')
      throw Object.assign(new Error('Sample replay is read-only'), { statusCode: 400 });
    const { text, id } = z
      .object({ text: z.string().trim().min(1).max(10000), id: z.string().uuid() })
      .parse(req.body);
    await c.userTurn(text, id);
    return c.session;
  });
  app.post('/api/sessions/:id/feedback', async (req) => {
    const c = controller(sessionId(req.params));
    if (c.session.status !== 'completed')
      throw Object.assign(new Error('End the session first'), { statusCode: 409 });
    await c.generateFeedback();
    return c.session;
  });
  app.post('/api/sessions/:id/retry', async (req, reply) => {
    if (!providers.providerStatus().openai)
      return reply.code(503).send({ error: 'An OpenAI key is required for a live retry.' });
    const parent = controller(sessionId(req.params)).session;
    const { questionId } = z.object({ questionId: z.string() }).parse(req.body);
    const index = parent.transcript.findIndex((t) => t.id === questionId && t.speaker !== 'user');
    if (index < 0) return reply.code(400).send({ error: 'Select a panel question to retry.' });
    const q = parent.transcript[index];
    const originalAnswerIds: string[] = [];
    for (const t of parent.transcript.slice(index + 1)) {
      if (t.speaker !== 'user') break;
      originalAnswerIds.push(t.id);
    }
    const session: Session = {
      ...parent,
      id: randomUUID(),
      createdAt: Date.now(),
      status: 'ready',
      mode: 'live',
      inputMode: 'voice',
      recording: false,
      audioAvailable: false,
      elapsedMs: 0,
      transcript: [],
      feedback: null,
      feedbackError: null,
      retry: { parentSessionId: parent.id, questionId, originalAnswerIds },
      objections: [{ persona: Persona.parse(q.speaker), question: q.text }],
    };
    store.save(session);
    return session;
  });
  app.get('/api/sessions/:id/events', async (req, reply) => {
    const c = controller(sessionId(req.params));
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Encoding': 'identity',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: SessionEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    const listener = (event: SessionEvent) => send(event);
    c.on('event', listener);
    send({ type: 'state', status: c.session.status, elapsedMs: c.session.elapsedMs });
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000);
    reply.raw.on('close', () => {
      streams.delete(reply.raw);
      clearInterval(heartbeat);
      c.off('event', listener);
    });
  });
  app.get('/api/sessions/:id/voice-status', async (req) => ({
    ready: controller(sessionId(req.params)).voiceReady,
  }));
  app.post('/api/sessions/:id/connect', async (req, reply) => {
    const c = controller(sessionId(req.params));
    if (c.session.mode === 'sample' || c.session.status === 'completed')
      return reply.code(409).send({ error: 'This session cannot connect to voice.' });
    if (!process.env.INTERNAL_TOKEN || process.env.INTERNAL_TOKEN.length < 32)
      return reply
        .code(503)
        .send({ error: 'Run npm run setup to configure the local worker secret.' });
    const url = process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';
    const key = process.env.LIVEKIT_API_KEY || 'devkey';
    const secret = process.env.LIVEKIT_API_SECRET || 'secret';
    const room = `hotseat-${c.session.id}`;
    try {
      const dispatch = new AgentDispatchClient(url, key, secret);
      const existing = await dispatch.listDispatch(room).catch(() => []);
      for (const job of existing.filter((d) => d.agentName === 'hotseat'))
        await dispatch.deleteDispatch(job.id, room);
      c.resetVoiceConnection();
      await dispatch.createDispatch(room, 'hotseat', {
        metadata: JSON.stringify({ sessionId: c.session.id }),
      });
    } catch {
      return reply.code(503).send({
        error: 'LiveKit is not reachable. Start the voice server and worker, or continue in text.',
      });
    }
    const token = new AccessToken(key, secret, { identity: 'founder', ttl: 600 });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return { url: process.env.LIVEKIT_PUBLIC_URL || url, token: await token.toJwt() };
  });
  app.delete('/api/sessions/:id', async (req) => {
    const id = sessionId(req.params);
    const c = controllers.get(id);
    c?.dispose();
    controllers.delete(id);
    store.remove(id);
    if (process.env.LIVEKIT_URL) {
      const service = new RoomServiceClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
      );
      void service.deleteRoom(`hotseat-${id}`).catch(() => {});
    }
    return { deleted: true };
  });
  app.post('/api/sessions/:id/audio', async (req, reply) => {
    const c = controller(sessionId(req.params));
    if (!c.session.recording || c.session.mode === 'sample')
      return reply.code(403).send({ error: 'Recording was not enabled for this session.' });
    const file = await req.file({ limits: { fileSize: 50 * 1024 * 1024 } });
    if (!file || !['audio/webm', 'video/webm'].includes(file.mimetype))
      return reply.code(400).send({ error: 'Expected a WebM audio recording.' });
    const buffer = await file.toBuffer();
    if (!store.get(c.session.id)) return reply.code(404).send({ error: 'Session deleted' });
    writeFileSync(store.audioPath(c.session.id), buffer, { mode: 0o600 });
    c.session.audioAvailable = true;
    store.save(c.session);
    return { saved: true };
  });
  app.get('/api/sessions/:id/audio', async (req, reply) => {
    const id = sessionId(req.params);
    if (!store.get(id) || !store.hasAudio(id))
      return reply.code(404).send({ error: 'No recording exists.' });
    return reply.type('audio/webm').send(createReadStream(store.audioPath(id)));
  });
  app.get('/api/sessions/:id/export', async (req, reply) => {
    const s = controller(sessionId(req.params)).session;
    const format = z
      .object({ format: z.enum(['json', 'md']).default('json') })
      .parse(req.query).format;
    reply.header('Content-Disposition', `attachment; filename="hotseat-${s.id}.${format}"`);
    if (format === 'json') return { ...s, metrics: store.metrics(s.id) };
    return reply
      .type('text/markdown')
      .send(
        `# ${s.pitch.name}\n\n${s.mode === 'sample' ? 'Sample replay' : 'Practice session'} · ${s.pressure}\n\n## Transcript\n\n${s.transcript.map((t) => `**${t.speaker}** (${Math.floor(t.at / 1000)}s): ${t.text}`).join('\n\n')}\n\n## Feedback\n\n${s.feedback?.summary || s.feedbackError || 'Not generated'}\n\n${s.feedback?.items.map((i) => `### ${i.title}\n\n${i.detail}\n\n${i.suggestion}\n\nEvidence: ${i.turnIds.join(', ')}`).join('\n\n') || ''}`,
      );
  });
  app.get('/api/internal/:id/commands', async (req, reply) => {
    const id = sessionId(req.params);
    if (!store.get(id)) return reply.code(404).send({ error: 'Session closed' });
    const { after } = z.object({ after: z.coerce.number().default(0) }).parse(req.query);
    return controller(id).poll(after);
  });
  app.post('/api/internal/:id/event', async (req) => {
    const c = controller(sessionId(req.params));
    const data = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('turn'), text: z.string().max(10000), id: z.string() }),
        z.object({ type: z.literal('partial'), text: z.string().max(10000) }),
        z.object({ type: z.literal('interrupt') }),
        z.object({ type: z.literal('error') }),
        z.object({ type: z.literal('ready') }),
        z.object({ type: z.literal('speaker'), persona: Persona.nullable() }),
        z.object({ type: z.literal('metric'), durationMs: z.number().nonnegative() }),
      ])
      .parse(req.body);
    if (data.type === 'turn') await c.userTurn(data.text, data.id);
    else if (data.type === 'partial') {
      c.emitEvent(data);
      void c.partial(data.text);
    } else if (data.type === 'interrupt') c.cancel();
    else if (data.type === 'error') c.voiceError();
    else if (data.type === 'metric')
      c.emitEvent({ type: 'metric', name: 'responseAudio', durationMs: data.durationMs });
    else {
      if (data.type === 'ready') c.voiceReady = true;
      c.emitEvent(data);
    }
    return { ok: true };
  });
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
  });
  app.addHook('onClose', async () => {
    for (const c of controllers.values()) c.dispose();
    store.close();
  });
  // A previous process cannot retain a working voice connection.
  for (const session of store.list())
    if (session.status === 'active') {
      session.status = 'paused';
      store.save(session);
    }
  return app;
}
