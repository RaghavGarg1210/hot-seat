'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Play,
  Mic,
  MicOff,
  Pause,
  SkipForward,
  Square,
  ChevronLeft,
  Upload,
  RotateCcw,
  Download,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  PANEL,
  SAMPLE_PITCH,
  SessionEvent,
  formatTime,
  type Persona,
  type Reaction,
  type PitchContext,
  type Session,
  type Pressure,
  type FeedbackItem,
} from '@hotseat/shared';
import { Avatar } from './avatar';
import { StudioHome, type SessionSummary } from './studio-home';

type View = 'home' | 'prepare' | 'room' | 'debrief';
const personas = Object.keys(PANEL) as Persona[];
async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers:
      !body || body instanceof FormData
        ? { 'x-hotseat': '1' }
        : { 'Content-Type': 'application/json', 'x-hotseat': '1' },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export default function HotSeat() {
  const [view, setView] = useState<View>('home');
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [providers, setProviders] = useState({ openai: false, jev: false });
  const [session, setSession] = useState<Session | null>(null);
  const [parent, setParent] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [brief, setBrief] = useState('');
  const [pitch, setPitch] = useState<PitchContext | null>(null);
  const [pressure, setPressure] = useState<Pressure>('challenging');
  const [duration, setDuration] = useState<5 | 8 | 12>(8);
  const [recording, setRecording] = useState(false);
  const [consent, setConsent] = useState(false);
  const [speaker, setSpeaker] = useState<Persona | null>(null);
  const [reactions, setReactions] = useState<Partial<Record<Persona, Reaction>>>({});
  const [partial, setPartial] = useState('');
  const [answer, setAnswer] = useState('');
  const [mic, setMic] = useState(true);
  const [connected, setConnected] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState('');
  const room = useRef<Room | null>(null);
  const events = useRef<EventSource | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mix = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const lastTurn = useRef<HTMLDivElement | null>(null);
  const refresh = useCallback(async () => {
    setHistory(await api<SessionSummary[]>('/sessions'));
    const health = await api<{ providers: typeof providers }>('/health');
    setProviders(health.providers);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    return () => {
      events.current?.close();
      void room.current?.disconnect();
      audioElements.current.forEach((e) => e.remove());
    };
  }, [refresh]);
  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy('');
    }
  }
  function watch(s: Session) {
    events.current?.close();
    const source = new EventSource(`/api/sessions/${s.id}/events`);
    events.current = source;
    source.onmessage = (e) => {
      const parsed = SessionEvent.safeParse(JSON.parse(e.data));
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === 'transcript') {
        setPartial('');
        setSession((old) =>
          old && !old.transcript.some((t) => t.id === event.turn.id)
            ? { ...old, transcript: [...old.transcript, event.turn] }
            : old,
        );
      } else if (event.type === 'partial') setPartial(event.text);
      else if (event.type === 'reaction')
        setReactions((old) => ({ ...old, [event.decision.persona]: event.decision.reaction }));
      else if (event.type === 'speaker') setSpeaker(event.persona);
      else if (event.type === 'state') {
        setSession((old) =>
          old ? { ...old, status: event.status, elapsedMs: event.elapsedMs } : old,
        );
        if (event.status === 'paused' && recorder.current?.state === 'recording')
          recorder.current.pause();
        if (event.status === 'completed') {
          setView('debrief');
          void disconnect();
        }
      } else if (event.type === 'notice') setNotice(event.message);
      else if (event.type === 'feedback')
        setSession((old) => (old ? { ...old, feedback: event.feedback } : old));
    };
    source.onerror = () => setNotice('Connection interrupted. Reconnecting to the session…');
  }
  useEffect(() => {
    lastTurn.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [session?.transcript.length, partial]);
  useEffect(() => {
    if (!replaying || !session || session.mode !== 'sample') return;
    const timer = setInterval(
      () =>
        setReplayIndex((i) => {
          if (i >= session.transcript.length) {
            setReplaying(false);
            return i;
          }
          return i + 1;
        }),
      2600,
    );
    return () => clearInterval(timer);
  }, [replaying, session]);
  const replayTurn =
    session?.mode === 'sample' ? session.transcript[Math.max(0, replayIndex - 1)] : null;
  useEffect(() => {
    if (replayTurn) {
      setSpeaker(replayTurn.speaker === 'user' ? null : replayTurn.speaker);
      setReactions({ investor: 'skeptical', customer: 'interested', operator: 'questioning' });
    }
  }, [replayTurn]);
  async function stopRecording() {
    const r = recorder.current;
    if (r && r.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        r.addEventListener('stop', () => resolve(), { once: true });
        r.stop();
      });
    }
    recorder.current = null;
  }
  async function disconnect() {
    const previousRoom = room.current;
    const previousContext = audioContext.current;
    room.current = null;
    audioContext.current = null;
    mix.current = null;
    await stopRecording();
    await previousRoom?.disconnect();
    audioElements.current.forEach((element) => element.remove());
    audioElements.current = [];
    if (previousContext && previousContext.state !== 'closed') await previousContext.close();
    setConnected(false);
  }
  function addRecordingTrack(track: MediaStreamTrack) {
    if (audioContext.current && mix.current)
      audioContext.current.createMediaStreamSource(new MediaStream([track])).connect(mix.current);
  }
  async function connect(s: Session) {
    const credentials = await api<{ url: string; token: string }>(`/sessions/${s.id}/connect`, {});
    const next = new Room({ adaptiveStream: true, dynacast: true });
    room.current = next;
    if (s.recording) {
      audioContext.current = new AudioContext();
      mix.current = audioContext.current.createMediaStreamDestination();
    }
    next.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        document.body.appendChild(element);
        audioElements.current.push(element);
        addRecordingTrack(track.mediaStreamTrack);
      }
    });
    next.on(RoomEvent.Disconnected, () => {
      if (room.current !== next) return;
      void api(`/sessions/${s.id}/control`, { action: 'pause' }).catch(() => {});
      void disconnect();
      setConnected(false);
      setNotice('Voice disconnected. Reconnect or continue in text.');
    });
    try {
      await next.connect(credentials.url, credentials.token);
      await next.startAudio();
      const publication = await next.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (publication?.track) addRecordingTrack(publication.track.mediaStreamTrack);
      if (s.recording && mix.current) {
        const chunks: Blob[] = [];
        const r = new MediaRecorder(mix.current.stream, { mimeType: 'audio/webm' });
        r.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        r.onstop = () => {
          const data = new FormData();
          data.append('audio', new Blob(chunks, { type: 'audio/webm' }), 'session.webm');
          void api(`/sessions/${s.id}/audio`, data)
            .then(() => setSession((old) => (old ? { ...old, audioAvailable: true } : old)))
            .catch((e) => setError(e.message));
        };
        recorder.current = r;
        r.start(1000);
      }
      const deadline = Date.now() + 20000;
      let workerReady = false;
      while (Date.now() < deadline) {
        workerReady = (await api<{ ready: boolean }>(`/sessions/${s.id}/voice-status`)).ready;
        if (workerReady) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!workerReady)
        throw new Error(
          'The voice worker did not join. Start npm run dev:agent, then reconnect or continue in text.',
        );
      setConnected(true);
      setMic(true);
      setNotice('');
    } catch (e) {
      await disconnect();
      throw e;
    }
  }
  async function openSession(id: string) {
    await disconnect();
    const s = await api<Session>(`/sessions/${id}`);
    setSession(s);
    setParent(
      s.retry ? await api<Session>(`/sessions/${s.retry.parentSessionId}`).catch(() => null) : null,
    );
    setView(s.status === 'completed' ? 'debrief' : 'room');
    if (s.mode === 'live') watch(s);
  }
  async function sample() {
    await disconnect();
    const s = await api<Session>('/sample', {});
    setSession(s);
    setParent(null);
    setReplayIndex(0);
    setReplaying(true);
    setView('room');
    await refresh();
  }
  async function prepare() {
    const context = await api<PitchContext>('/prepare', { text: brief });
    setPitch(context);
  }
  async function upload(file: File) {
    const form = new FormData();
    form.append('deck', file);
    setPitch(await api<PitchContext>('/prepare/pdf', form));
  }
  async function start() {
    if (!pitch) return;
    const s = await api<Session>('/sessions', {
      pitch,
      pressure,
      duration,
      recording,
      inputMode: 'voice',
    });
    setSession(s);
    setParent(null);
    setView('room');
    watch(s);
    try {
      await connect(s);
      const started = await api<Session>(`/sessions/${s.id}/control`, { action: 'start' });
      setSession(started);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect');
    }
    await refresh();
  }
  async function control(action: string) {
    if (!session) return;
    if (action === 'pause' && recorder.current?.state === 'recording') recorder.current.pause();
    if (action === 'resume' && recorder.current?.state === 'paused') recorder.current.resume();
    if (action === 'end') {
      await disconnect();
      setView('debrief');
    }
    const s = await api<Session>(`/sessions/${session.id}/control`, { action });
    setSession(s);
    if (action === 'end') await refresh();
  }
  async function textMode() {
    if (!session) return;
    await disconnect();
    await api(`/sessions/${session.id}/control`, { action: 'text' });
    setSession(
      await api<Session>(`/sessions/${session.id}/control`, {
        action: session.status === 'ready' ? 'start' : 'resume',
      }),
    );
    setNotice('Text practice: enter your answer below.');
  }
  async function send() {
    if (!session || !answer.trim()) return;
    const text = answer;
    setAnswer('');
    setSession(
      await api<Session>(`/sessions/${session.id}/turn`, { text, id: crypto.randomUUID() }),
    );
  }
  async function retry(item: FeedbackItem) {
    if (!session || !item.questionId) return;
    if (
      providers.openai &&
      !window.confirm(
        'Start a live retry? This simulated panel uses synthetic voices. Your speech and pitch context will be sent to the configured providers and the transcript saved locally. Audio recording is off.',
      )
    )
      return;
    const original = session;
    const next = await api<Session>(`/sessions/${session.id}/retry`, {
      questionId: item.questionId,
    });
    setSession(next);
    setParent(original);
    setSpeaker(null);
    setReactions({});
    setView('room');
    watch(next);
    try {
      await connect(next);
      setSession(await api<Session>(`/sessions/${next.id}/control`, { action: 'start' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice unavailable');
    }
  }
  async function toggleMic() {
    await room.current?.localParticipant.setMicrophoneEnabled(!mic);
    setMic(!mic);
  }
  async function home() {
    if (session?.status === 'active') await control('pause');
    await disconnect();
    events.current?.close();
    setView('home');
    setNotice('');
    setReplaying(false);
    await refresh();
  }
  useEffect(() => {
    if (view !== 'room' || session?.mode !== 'live') return;
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.closest('input,textarea,button,a,[contenteditable]')
      )
        return;
      if (event.key.toLowerCase() === 'm' && connected) {
        event.preventDefault();
        void run('', toggleMic);
      }
      if (event.key.toLowerCase() === 'p' && session.status !== 'ready') {
        event.preventDefault();
        void run('', () => control(session.status === 'active' ? 'pause' : 'resume'));
      }
      if (event.key.toLowerCase() === 'n' && session.status === 'active') {
        event.preventDefault();
        void run('', () => control('skip'));
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  const active = session?.status === 'active';
  const visibleTurns =
    session?.mode === 'sample'
      ? session.transcript.slice(0, replayIndex)
      : session?.transcript || [];
  return (
    <div className={`app-shell ${view === 'room' ? 'in-session' : ''}`}>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="studio-header">
        <button className="brand" aria-label="HotSeat studio" onClick={() => void run('', home)}>
          <svg className="brand-mark" viewBox="0 0 32 36" aria-hidden="true">
            <path d="M8 3h16v15H8zM5 20h22v5H5z" fill="currentColor" />
            <path d="M8 25v8m16-8v8" stroke="currentColor" strokeWidth="3" />
          </svg>
          hotseat<span className="brand-dot">.</span>
        </button>
        <span className="brand-description">A place to practice.</span>
        <nav aria-label="Main navigation">
          <button
            className={view === 'home' ? 'nav active' : 'nav'}
            aria-current={view === 'home' ? 'page' : undefined}
            onClick={() => void run('', home)}
          >
            Studio
          </button>
          <button
            className={view === 'prepare' ? 'nav active' : 'nav'}
            aria-current={view === 'prepare' ? 'page' : undefined}
            onClick={() => {
              void run('', async () => {
                await home();
                setPitch(null);
                setConsent(false);
                setView('prepare');
              });
            }}
          >
            <Plus size={15} /> New session
          </button>
        </nav>
        <a
          className="github-link"
          href="https://github.com/RaghavGarg1210/hot-seat"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <ArrowUpRight size={14} />
        </a>
      </header>
      <main className="main-area" id="workspace" tabIndex={-1}>
        {(error || notice) && (
          <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
            <AlertCircle size={17} />
            <span>{error || notice}</span>
            <button
              aria-label="Dismiss notice"
              onClick={() => {
                setError('');
                setNotice('');
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {view === 'home' && (
          <StudioHome
            history={history}
            busy={!!busy}
            onStart={() => {
              setPitch(null);
              setConsent(false);
              setView('prepare');
            }}
            onSample={() => void run('Loading sample', sample)}
            onRefresh={() => void run('', refresh)}
            onOpen={(id) => void run('Opening session', () => openSession(id))}
            onDelete={(id) => {
              if (window.confirm('Delete this session, transcript, feedback, and recording?'))
                void run('', async () => {
                  await api(`/sessions/${id}`, undefined, 'DELETE');
                  await refresh();
                });
            }}
          />
        )}
        {view === 'prepare' && (
          <div className="page setup">
            <button className="back text-button" onClick={() => void run('', home)}>
              <ChevronLeft size={16} />
              Overview
            </button>
            <div className="eyebrow">SET THE SCENE</div>
            <h1>
              What are you
              <br />
              <em>pitching?</em>
            </h1>
            <p className="lede">A little context makes the questions a lot better.</p>
            <div className="setup-grid">
              <section className="card form-card">
                <div className="card-heading">
                  <span className="step-dot">1</span>
                  <h2>{pitch ? 'Review your pitch context' : 'Bring your idea'}</h2>
                </div>
                {!pitch ? (
                  <>
                    <label htmlFor="brief">Your startup, in your own words</label>
                    <textarea
                      id="brief"
                      rows={9}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="What problem are you solving? Who is it for? What have you tested so far? Include your business model and what you’re asking for."
                    />
                    <div className="input-actions">
                      <label className="upload-button">
                        <Upload size={16} />
                        Upload a PDF
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void run('Reading your deck', () => upload(file));
                          }}
                        />
                      </label>
                      <button
                        className="text-button"
                        onClick={() => setBrief(SAMPLE_PITCH.summary)}
                      >
                        Use an example
                      </button>
                    </div>
                    <small className="hint">Text-based PDFs · Up to 40 pages · 20 MB</small>
                    <button
                      className="primary full"
                      disabled={brief.trim().length < 20 || !!busy}
                      onClick={() => void run('Preparing context', prepare)}
                    >
                      {busy || 'Prepare my context'}
                      <ArrowRight size={16} />
                    </button>
                    {!providers.openai && (
                      <p className="hint">
                        Live preparation needs an OpenAI key in your local .env. You can explore the
                        sample replay without keys.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <label>
                      Startup name
                      <input
                        value={pitch.name}
                        onChange={(e) => setPitch({ ...pitch, name: e.target.value })}
                      />
                    </label>
                    {(
                      [
                        'summary',
                        'problem',
                        'customer',
                        'solution',
                        'traction',
                        'businessModel',
                        'ask',
                      ] as const
                    ).map((field) => (
                      <label key={field}>
                        {field === 'businessModel'
                          ? 'Business model'
                          : field[0].toUpperCase() + field.slice(1)}
                        <textarea
                          rows={field === 'summary' ? 4 : 2}
                          value={pitch[field]}
                          onChange={(e) => setPitch({ ...pitch, [field]: e.target.value })}
                        />
                      </label>
                    ))}
                    <p className="hint">
                      Correct any assumptions before starting.{' '}
                      {pitch.sources.length
                        ? `${pitch.sources.length} source pages retained for reference.`
                        : ''}
                    </p>
                    <button className="text-button" onClick={() => setPitch(null)}>
                      Start over
                    </button>
                  </>
                )}
              </section>
              <section className="settings">
                <div className="card">
                  <div className="card-heading">
                    <span className="step-dot">2</span>
                    <h2>Choose your pressure</h2>
                  </div>
                  {(['supportive', 'challenging', 'intense'] as Pressure[]).map((p) => (
                    <button
                      key={p}
                      className={`pressure-option ${pressure === p ? 'selected' : ''}`}
                      onClick={() => setPressure(p)}
                    >
                      <span>
                        <strong>{p[0].toUpperCase() + p.slice(1)}</strong>
                        <small>
                          {p === 'supportive'
                            ? 'Room to think. Questions at natural pauses.'
                            : p === 'challenging'
                              ? 'The hard questions, with room to recover.'
                              : 'Persistent follow-ups. Think on your feet.'}
                        </small>
                      </span>
                      {pressure === p ? <Check size={18} /> : <span className="radio" />}
                    </button>
                  ))}
                  <label className="duration-label">Session length</label>
                  <div className="segmented">
                    {([5, 8, 12] as const).map((n) => (
                      <button
                        className={duration === n ? 'selected' : ''}
                        key={n}
                        onClick={() => setDuration(n)}
                      >
                        {n} min
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card privacy">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={recording}
                      onChange={(e) => setRecording(e.target.checked)}
                    />
                    <span>
                      Save an audio recording
                      <small>Off by default. Stored locally with this session.</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I understand how practice works
                      <small>
                        This is a simulated panel with synthetic voices. My speech and pitch context
                        are sent to the configured model providers. Transcripts are saved on this
                        device.
                      </small>
                    </span>
                  </label>
                </div>
                <button
                  className="primary full"
                  disabled={!pitch || !consent || !!busy}
                  onClick={() => void run('Getting the panel ready', start)}
                >
                  {busy || 'Take the hot seat'}
                  <ArrowUpRight size={18} />
                </button>
              </section>
            </div>
          </div>
        )}
        {view === 'room' && session && (
          <div className="page room-page">
            <div className="room-heading">
              <div>
                <div className="eyebrow">
                  {session.mode === 'sample'
                    ? 'SAMPLE REPLAY · NO LIVE INFERENCE'
                    : session.retry
                      ? 'ANOTHER SHOT AT THE HARD QUESTION'
                      : 'YOUR PRACTICE ROOM'}
                </div>
                <h2>
                  {session.pitch.name}
                  <span className="pill">{session.pressure}</span>
                </h2>
              </div>
              <div className="timer">
                <span className={active || replaying ? 'live-dot' : ''} />
                {session.mode === 'sample'
                  ? formatTime(replayTurn?.at || 0)
                  : formatTime(session.duration * 60000 - session.elapsedMs)}
                <small>{session.mode === 'sample' ? 'REPLAY' : session.status.toUpperCase()}</small>
              </div>
            </div>
            <div className="panel-grid">
              {personas.map((p) => (
                <article className={`panel-card ${speaker === p ? 'is-speaking' : ''}`} key={p}>
                  <div className="panel-image">
                    <Avatar
                      persona={p}
                      reaction={
                        speaker === p
                          ? session.inputMode === 'text'
                            ? 'questioning'
                            : 'speaking'
                          : reactions[p] || 'listening'
                      }
                    />
                    <span className="reaction-label">
                      <i />
                      {speaker === p
                        ? session.inputMode === 'text'
                          ? 'Questioning'
                          : 'Speaking'
                        : reactions[p] || 'Listening'}
                    </span>
                  </div>
                  <div className="panel-info">
                    <span>
                      <strong>{PANEL[p].name}</strong>
                      <small>{PANEL[p].title}</small>
                    </span>
                    <span className="sound-bars">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <div className="room-bottom">
              <section className="transcript card">
                <div className="card-heading">
                  <h3>Conversation</h3>
                  <span className="tiny-label">
                    {session.mode === 'sample' ? 'SCRIPTED EXAMPLE' : 'LIVE CAPTIONS'}
                  </span>
                </div>
                <div className="transcript-scroll" aria-live="polite">
                  {!visibleTurns.length && (
                    <p className="transcript-placeholder">
                      {session.mode === 'sample'
                        ? 'The panel is about to ask its first question.'
                        : 'Your panel is ready. Take a breath, then introduce your idea.'}
                    </p>
                  )}
                  {visibleTurns.map((t) => (
                    <div className={`turn ${t.speaker === 'user' ? 'user-turn' : ''}`} key={t.id}>
                      <span>
                        {t.speaker === 'user' ? 'YOU' : PANEL[t.speaker].name.toUpperCase()}
                        <small>{formatTime(t.at)}</small>
                      </span>
                      <p>{t.text}</p>
                    </div>
                  ))}
                  {partial && (
                    <div className="turn partial">
                      <span>YOU</span>
                      <p>{partial}</p>
                    </div>
                  )}
                  <div ref={lastTurn} />
                </div>
              </section>
              <aside className="room-tip">
                <span className="tiny-label">IN YOUR CORNER</span>
                <h3>{session.retry ? 'You get another shot.' : 'A pause is not a problem.'}</h3>
                <p>
                  {session.retry
                    ? 'Answer the same question again. Be specific about what you know and what you still need to test.'
                    : 'Take a breath. Acknowledge what you don’t know. A clear answer beats a fast one.'}
                </p>
                <span>Simulated panel · Synthetic voices</span>
              </aside>
            </div>
            {session.mode === 'sample' ? (
              <div className="controls">
                <button className="control" onClick={() => setReplaying(!replaying)}>
                  {replaying ? <Pause size={18} /> : <Play size={18} />}{' '}
                  {replaying ? 'Pause replay' : 'Play replay'}
                </button>
                <button
                  className="control"
                  onClick={() => {
                    setReplayIndex(0);
                    setReplaying(true);
                  }}
                >
                  <RotateCcw size={18} />
                  Restart
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setReplaying(false);
                    setView('debrief');
                  }}
                >
                  See the debrief
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="controls">
                  {connected && (
                    <button
                      className={`control ${!mic ? 'off' : ''}`}
                      onClick={() => void run('', toggleMic)}
                    >
                      {mic ? <Mic size={18} /> : <MicOff size={18} />} {mic ? 'Mute' : 'Unmute'}
                    </button>
                  )}
                  <button
                    className="control"
                    disabled={!!busy || session.status === 'ready'}
                    onClick={() => void run('', () => control(active ? 'pause' : 'resume'))}
                  >
                    {active ? <Pause size={18} /> : <Play size={18} />}{' '}
                    {active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="control"
                    disabled={!active || !!busy}
                    onClick={() => void run('', () => control('skip'))}
                  >
                    <SkipForward size={18} />
                    Skip question
                  </button>
                  <button
                    className="control end"
                    disabled={!!busy}
                    onClick={() => void run('Preparing your debrief', () => control('end'))}
                  >
                    <Square size={15} />
                    End session
                  </button>
                </div>
                {!connected && session.inputMode === 'voice' && (
                  <div className="connection-options">
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        void run('Connecting', async () => {
                          await connect(session);
                          setSession(
                            await api<Session>(`/sessions/${session.id}/control`, {
                              action: session.status === 'ready' ? 'start' : 'resume',
                            }),
                          );
                        })
                      }
                    >
                      Connect voice
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => void run('', textMode)}
                    >
                      Continue in text
                    </button>
                  </div>
                )}
                {session.inputMode === 'text' && (
                  <form
                    className="text-answer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('Listening to your answer', send);
                    }}
                  >
                    <textarea
                      aria-label="Your answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Your answer…"
                      rows={2}
                    />
                    <button className="primary" disabled={!active || !!busy || !answer.trim()}>
                      Send answer <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </>
            )}
            <p className="room-footnote">
              {busy ||
                (session.recording
                  ? 'Recording enabled for this session.'
                  : 'Audio recording is off. Your transcript stays in your local workspace.')}
            </p>
          </div>
        )}
        {view === 'debrief' && session && (
          <div className="page debrief">
            <button className="text-button back" onClick={() => void run('', home)}>
              <ChevronLeft size={16} />
              All sessions
            </button>
            <div className="eyebrow">
              {session.mode === 'sample' ? 'SAMPLE DEBRIEF' : 'THE PART WHERE YOU GET BETTER'}
            </div>
            <div className="debrief-heading">
              <div>
                <h1>
                  Keep the clarity.
                  <br />
                  <em>Sharpen the answer.</em>
                </h1>
                <p className="lede">
                  {session.pitch.name} · {session.pressure} · {formatTime(session.elapsedMs)}
                </p>
              </div>
              <div className="export-actions">
                <a className="control" href={`/api/sessions/${session.id}/export?format=md`}>
                  <Download size={15} />
                  Markdown
                </a>
                <a className="control" href={`/api/sessions/${session.id}/export?format=json`}>
                  JSON
                </a>
              </div>
            </div>
            {session.feedback ? (
              <div className="summary-card">
                <span className="tiny-label">YOUR TAKEAWAY</span>
                <p>{session.feedback.summary}</p>
              </div>
            ) : (
              <div className="summary-card">
                <p>{busy || session.feedbackError || 'Preparing feedback from your transcript…'}</p>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    void run('Generating feedback', async () =>
                      setSession(await api<Session>(`/sessions/${session.id}/feedback`, {})),
                    )
                  }
                >
                  Retry feedback
                </button>
              </div>
            )}
            {parent && session.retry && (
              <div className="comparison card">
                <h2>Same question. A fresh answer.</h2>
                <div className="comparison-grid">
                  <div>
                    <span className="tiny-label">ORIGINAL ANSWER</span>
                    {parent.transcript
                      .filter((t) => session.retry?.originalAnswerIds.includes(t.id))
                      .map((t) => (
                        <p key={t.id}>{t.text}</p>
                      ))}
                  </div>
                  <div>
                    <span className="tiny-label">THIS ATTEMPT</span>
                    {session.transcript
                      .filter((t) => t.speaker === 'user')
                      .map((t) => (
                        <p key={t.id}>{t.text}</p>
                      ))}
                  </div>
                </div>
                <p className="hint">
                  Compare clarity, specificity, evidence, and whether you answered the question.
                </p>
              </div>
            )}
            <div className="feedback-grid">
              {session.feedback?.items.map((item) => (
                <article className="feedback-card" key={item.id}>
                  <div className="feedback-kind">
                    <span className={item.kind === 'strength' ? 'strength' : 'improve'}>
                      {item.kind === 'strength' ? <Check size={14} /> : <ArrowUpRight size={14} />}{' '}
                      {item.kind === 'strength'
                        ? 'KEEP DOING THIS'
                        : item.kind === 'unsupported'
                          ? 'BACK IT UP'
                          : item.kind === 'unanswered'
                            ? 'ANSWER THE QUESTION'
                            : 'SHARPEN THIS'}
                    </span>
                    <small>{item.criterion}</small>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <div className="suggestion">{item.suggestion}</div>
                  <div className="feedback-actions">
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelectedTurn(item.turnIds[0]);
                        document
                          .getElementById(`turn-${item.turnIds[0]}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      See the moment <ArrowUpRight size={14} />
                    </button>
                    {item.questionId && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() => void run('Preparing your retry', () => retry(item))}
                      >
                        <RotateCcw size={14} />
                        Retry answer
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {session.audioAvailable && (
              <section className="card recording-player">
                <h3>Session recording</h3>
                <audio controls src={`/api/sessions/${session.id}/audio`} />
              </section>
            )}
            <details className="review-transcript" open>
              <summary>
                Full conversation <span>{session.transcript.length} turns</span>
              </summary>
              {session.transcript.map((t) => (
                <div
                  id={`turn-${t.id}`}
                  key={t.id}
                  className={`turn ${selectedTurn === t.id ? 'highlight' : ''}`}
                >
                  <span>
                    {t.speaker === 'user' ? 'YOU' : PANEL[t.speaker].name.toUpperCase()}
                    <small>{formatTime(t.at)}</small>
                  </span>
                  <p>{t.text}</p>
                </div>
              ))}
            </details>
            <footer className="page-footer">
              Progress comes from practice.
              <button
                className="text-button"
                onClick={() => {
                  setPitch(session.pitch);
                  setConsent(false);
                  setView('prepare');
                }}
              >
                Practice again <ArrowRight size={15} />
              </button>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
