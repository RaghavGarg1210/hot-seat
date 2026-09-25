import { cli, defineAgent, ServerOptions, voice, type JobContext, type llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'node:url';
import { PANEL, Persona } from '@hotseat/shared';
import type { WorkerCommand } from './controller.js';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const { sessionId } = JSON.parse(ctx.job.metadata || '{}') as { sessionId: string };
    if (!sessionId) throw new Error('Missing HotSeat session ID');
    const base = process.env.SESSION_API_URL || 'http://127.0.0.1:4000';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_TOKEN}`,
    };
    const post = async (data: unknown) => {
      const r = await fetch(`${base}/api/internal/${sessionId}/event`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`Session API unavailable (${r.status})`);
    };
    const vad = await silero.VAD.load();
    const tts = new openai.TTS({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: 'alloy',
    });
    const session = new voice.AgentSession({
      vad,
      stt: new openai.STT({
        model: process.env.OPENAI_STT_MODEL || 'gpt-realtime-whisper',
        useRealtime: true,
        vad,
      }),
      tts,
      turnDetection: 'vad',
      voiceOptions: { allowInterruptions: true, minEndpointingDelay: 500 },
    });
    class PanelAgent extends voice.Agent {
      constructor() {
        super({
          instructions:
            'Speech is controlled by the HotSeat session service. Do not generate autonomous replies.',
        });
      }
      async onUserTurnCompleted(_chat: llm.ChatContext, message: llm.ChatMessage) {
        await post({ type: 'turn', text: message.textContent || '', id: message.id });
        throw new voice.StopResponse();
      }
    }
    let stopped = false;
    let currentPersona: Persona | null = null;
    let responseBegan = 0;
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (e) => {
      if (!e.isFinal) void post({ type: 'partial', text: e.transcript }).catch(() => {});
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (e) => {
      if (e.newState === 'speaking') {
        responseBegan = 0;
        void post({ type: 'interrupt' }).catch(() => {});
      } else if (e.oldState === 'speaking') {
        responseBegan = Date.now();
      }
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (e) => {
      if (e.newState === 'speaking') {
        void post({ type: 'speaker', persona: currentPersona }).catch(() => {});
        if (responseBegan) {
          void post({ type: 'metric', durationMs: Date.now() - responseBegan }).catch(() => {});
          responseBegan = 0;
        }
      }
      if (e.oldState === 'speaking' && e.newState !== 'speaking')
        void post({ type: 'speaker', persona: null }).catch(() => {});
    });
    session.on(
      voice.AgentSessionEventTypes.Error,
      () => void post({ type: 'error' }).catch(() => {}),
    );
    session.on(voice.AgentSessionEventTypes.Close, () => {
      if (!stopped) void post({ type: 'error' }).catch(() => {});
    });
    ctx.addShutdownCallback(async () => {
      stopped = true;
      await session.close();
    });
    await ctx.connect();
    await session.start({ agent: new PanelAgent(), room: ctx.room, record: false });
    await post({ type: 'ready' });
    let cursor = 0;
    const poll = async () => {
      while (!stopped) {
        try {
          const response = await fetch(
            `${base}/api/internal/${sessionId}/commands?after=${cursor}`,
            { headers, signal: AbortSignal.timeout(5000) },
          );
          if (response.status === 404) {
            stopped = true;
            break;
          }
          if (!response.ok) throw new Error('Session unavailable');
          const commands = (await response.json()) as { id: number; command: WorkerCommand }[];
          for (const { id, command } of commands) {
            cursor = id;
            if (command.type === 'cancel') session.interrupt({ force: true });
            else if (command.type === 'input') session.input.setAudioEnabled(command.enabled);
            else if (command.type === 'close') {
              stopped = true;
              await session.close();
              break;
            } else if (command.type === 'speak') {
              if (commands.some((c) => c.id > id && ['cancel', 'close'].includes(c.command.type)))
                continue;
              currentPersona = command.persona;
              tts.updateOptions({ voice: PANEL[command.persona].voice });
              session.say(command.text, { allowInterruptions: true });
            }
          }
        } catch {
          await post({ type: 'error' }).catch(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await ctx.shutdown('HotSeat session ended');
    };
    void poll();
  },
});
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'hotseat' }));
