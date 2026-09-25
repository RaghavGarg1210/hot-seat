import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Play, RotateCcw, Trash2 } from 'lucide-react';
import { PANEL, type Persona, type Session } from '@hotseat/shared';
import { Avatar } from './avatar';

export type SessionSummary = Pick<
  Session,
  'id' | 'createdAt' | 'status' | 'pressure' | 'duration' | 'mode' | 'elapsedMs'
> & { name: string };

const seats: { persona: Persona; question: string; focus: string }[] = [
  {
    persona: 'investor',
    question: 'Interest is nice. What makes you sure people will pay?',
    focus: 'The business behind the idea.',
  },
  {
    persona: 'customer',
    question: 'I already have a way of doing this. Why would I switch?',
    focus: 'The problem worth solving.',
  },
  {
    persona: 'operator',
    question: 'You have six weeks. What are you actually going to ship?',
    focus: 'The plan that can survive Monday.',
  },
];

export function StudioHome({
  history,
  busy,
  onStart,
  onSample,
  onOpen,
  onDelete,
  onRefresh,
}: {
  history: SessionSummary[];
  busy: boolean;
  onStart: () => void;
  onSample: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const seat = seats[selected];
  return (
    <div className="page home">
      <section className="studio-intro" aria-labelledby="studio-title">
        <div className="intro-copy">
          <div className="eyebrow">
            <span className="accent-dot" /> A REHEARSAL SPACE FOR FOUNDERS
          </div>
          <h1 id="studio-title">
            A better pitch
            <br />
            starts with a<br />
            <em>hard question.</em>
          </h1>
          <p className="intro-description">
            Meet the questions your slides don’t answer. Practice with three different perspectives,
            find the gaps, and go again.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={onStart}>
              Start a session <ArrowUpRight size={18} />
            </button>
            <button className="text-button sample-link" disabled={busy} onClick={onSample}>
              <Play size={14} /> Watch a sample
            </button>
          </div>
          <p className="session-details">
            5–12 minutes <span aria-hidden="true">/</span> Three panelists{' '}
            <span aria-hidden="true">/</span> Your pace
          </p>
        </div>
        <div className="question-preview">
          <div className="question-heading">
            <span>THE OTHER SIDE OF THE TABLE</span>
            <span>0{selected + 1} / 03</span>
          </div>
          <div className="question-content" aria-live="polite">
            <span className="quote-symbol" aria-hidden="true">
              “
            </span>
            <blockquote>{seat.question}</blockquote>
            <div className="question-byline">
              <span className="byline-rule" />
              {PANEL[seat.persona].name}, {PANEL[seat.persona].title.toLowerCase()}
            </div>
          </div>
          <div className="seat-picker" aria-label="Explore panel perspectives">
            {seats.map(({ persona }, index) => (
              <button
                key={persona}
                className={index === selected ? 'seat-choice selected' : 'seat-choice'}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                <Avatar persona={persona} small />
                <span>
                  {PANEL[persona].name}
                  <small>{PANEL[persona].title.replace('The ', '')}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="preview-footnote">Sample questions from your simulated panel.</div>
        </div>
      </section>
      <div className="studio-workspace">
        <section className="session-ledger" aria-labelledby="sessions-title">
          <div className="section-heading">
            <h2 id="sessions-title">
              Your sessions <span className="count">{String(history.length).padStart(2, '0')}</span>
            </h2>
            <button
              className="icon-button"
              aria-label="Refresh sessions"
              disabled={busy}
              onClick={onRefresh}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          {history.length === 0 ? (
            <div className="empty-ledger">
              <span className="empty-number" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Every good pitch starts somewhere.</h3>
                <p>
                  Your sessions and notes will live here.
                  <br />
                  Try a rehearsal. There’s nothing to get right yet.
                </p>
                <button className="text-button" onClick={onStart}>
                  Make your first attempt <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div className="history-list">
              {history.map((session, index) => (
                <div className="history-row" key={session.id}>
                  <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
                  <button className="session-link" onClick={() => onOpen(session.id)}>
                    <strong>{session.name}</strong>
                    <small>
                      {new Date(session.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      ·{' '}
                      {session.mode === 'sample'
                        ? 'Sample replay'
                        : `${session.pressure} · ${session.duration} min`}
                    </small>
                  </button>
                  <span className="pill">
                    {session.status === 'completed' ? 'Debrief ready' : session.status}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${session.name} session`}
                    onClick={() => onDelete(session.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="practice-notes">
          <div className="eyebrow">A SMALL RITUAL. A STRONGER PITCH.</div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Bring something real.</strong>
                <p>A brief, a deck, or an idea you can’t stop thinking about.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Make your case.</strong>
                <p>Answer the question. Take a pause. Change your mind.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Try that answer again.</strong>
                <p>Use the transcript and feedback to make the next attempt clearer.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>
      <footer className="page-footer">
        <span>Good ideas deserve a good rehearsal.</span>
        <span>Simulated panel · Synthetic voices</span>
      </footer>
    </div>
  );
}
