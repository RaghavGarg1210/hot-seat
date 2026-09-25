import { z } from 'zod';

export const Persona = z.enum(['investor', 'customer', 'operator']);
export type Persona = z.infer<typeof Persona>;
export const Pressure = z.enum(['supportive', 'challenging', 'intense']);
export type Pressure = z.infer<typeof Pressure>;
export const Reaction = z.enum(['listening', 'interested', 'skeptical', 'questioning', 'speaking']);
export type Reaction = z.infer<typeof Reaction>;
export const PANEL = {
  investor: {
    name: 'Alex',
    title: 'The investor',
    focus: 'Traction & defensibility',
    color: '#d4c4a4',
    voice: 'alloy',
  },
  customer: {
    name: 'Maya',
    title: 'The customer',
    focus: 'Problem & value',
    color: '#c0cbbc',
    voice: 'coral',
  },
  operator: {
    name: 'Jordan',
    title: 'The operator',
    focus: 'Execution & distribution',
    color: '#bec4d2',
    voice: 'ash',
  },
} as const;
export const SourcePage = z.object({
  page: z.number().int().positive(),
  text: z.string().max(30000),
});
export const PitchContext = z.object({
  name: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(20).max(20000),
  problem: z.string().max(3000),
  customer: z.string().max(3000),
  solution: z.string().max(3000),
  traction: z.string().max(3000),
  businessModel: z.string().max(3000),
  ask: z.string().max(3000),
  sources: z.array(SourcePage).max(40),
});
export type PitchContext = z.infer<typeof PitchContext>;
export const TranscriptTurn = z.object({
  id: z.string(),
  speaker: z.enum(['user', 'investor', 'customer', 'operator']),
  text: z.string(),
  at: z.number(),
  interrupted: z.boolean().optional(),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurn>;
export const PanelDecision = z.object({
  persona: Persona,
  reaction: Reaction,
  challenge: z.boolean(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['jev', 'baseline']),
});
export type PanelDecision = z.infer<typeof PanelDecision>;
export const FeedbackItem = z.object({
  id: z.string(),
  kind: z.enum(['strength', 'improvement', 'unanswered', 'unsupported']),
  criterion: z.enum(['clarity', 'specificity', 'evidence', 'answering']),
  title: z.string().max(150),
  detail: z.string().max(1500),
  suggestion: z.string().max(1500),
  turnIds: z.array(z.string()).min(1),
  questionId: z.string().nullable(),
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;
export const Feedback = z.object({
  summary: z.string().max(2000),
  items: z.array(FeedbackItem).max(12),
  source: z.enum(['model', 'sample']),
});
export type Feedback = z.infer<typeof Feedback>;
export const RetryAttempt = z.object({
  parentSessionId: z.string(),
  questionId: z.string(),
  originalAnswerIds: z.array(z.string()),
});
export type RetryAttempt = z.infer<typeof RetryAttempt>;
export const Session = z.object({
  id: z.string(),
  createdAt: z.number(),
  pitch: PitchContext,
  pressure: Pressure,
  duration: z.union([z.literal(5), z.literal(8), z.literal(12)]),
  status: z.enum(['ready', 'active', 'paused', 'completed']),
  mode: z.enum(['live', 'sample']),
  inputMode: z.enum(['voice', 'text']),
  recording: z.boolean(),
  audioAvailable: z.boolean(),
  elapsedMs: z.number(),
  transcript: z.array(TranscriptTurn),
  feedback: Feedback.nullable(),
  feedbackError: z.string().nullable(),
  retry: RetryAttempt.nullable(),
  objections: z.array(z.object({ persona: Persona, question: z.string() })),
});
export type Session = z.infer<typeof Session>;
export const CreateSession = z.object({
  pitch: PitchContext,
  pressure: Pressure.default('challenging'),
  duration: z.union([z.literal(5), z.literal(8), z.literal(12)]).default(8),
  recording: z.boolean().default(false),
  inputMode: z.enum(['voice', 'text']).default('voice'),
});
export const Control = z.enum(['start', 'pause', 'resume', 'skip', 'interrupt', 'end', 'text']);
export type Control = z.infer<typeof Control>;
export const SessionEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript'), turn: TranscriptTurn }),
  z.object({ type: z.literal('partial'), text: z.string() }),
  z.object({ type: z.literal('reaction'), decision: PanelDecision, latencyMs: z.number() }),
  z.object({ type: z.literal('speaker'), persona: Persona.nullable() }),
  z.object({ type: z.literal('state'), status: Session.shape.status, elapsedMs: z.number() }),
  z.object({ type: z.literal('notice'), message: z.string(), degraded: z.boolean() }),
  z.object({ type: z.literal('feedback'), feedback: Feedback }),
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('metric'),
    name: z.enum(['reaction', 'responseAudio']),
    durationMs: z.number(),
  }),
]);
export type SessionEvent = z.infer<typeof SessionEvent>;
export const SAMPLE_PITCH: PitchContext = {
  name: 'Gather',
  summary:
    'Gather helps independent coffee shops reduce food waste by predicting tomorrow’s demand. Managers upload a daily sales CSV and receive a preparation plan. We have interviewed 18 shop owners and have three unpaid pilots. We plan to charge $79 per location per month and are seeking five more pilot locations.',
  problem: 'Unsold pastries and sandwiches reduce already thin margins.',
  customer: 'Independent coffee shops with one to five locations.',
  solution: 'A daily demand forecast and preparation checklist from existing sales exports.',
  traction: '18 interviews; three unpaid pilot locations. No measured waste reduction yet.',
  businessModel: 'Proposed subscription: $79 per location per month.',
  ask: 'Five additional pilot locations.',
  sources: [],
};
export function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
