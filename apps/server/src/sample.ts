import { randomUUID } from 'node:crypto';
import { SAMPLE_PITCH, type Session } from '@hotseat/shared';
export function sampleSession(): Session {
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    pitch: SAMPLE_PITCH,
    pressure: 'challenging',
    duration: 8,
    status: 'completed',
    mode: 'sample',
    inputMode: 'text',
    recording: false,
    audioAvailable: false,
    elapsedMs: 95000,
    retry: null,
    feedbackError: null,
    objections: [],
    transcript: [
      {
        id: 'sample-1',
        speaker: 'investor',
        at: 0,
        text: 'You have three pilots. What evidence says these shops will actually pay?',
      },
      {
        id: 'sample-2',
        speaker: 'user',
        at: 8000,
        text: 'We interviewed 18 owners and they all said waste was painful. I think most would pay $79 a month.',
      },
      {
        id: 'sample-3',
        speaker: 'customer',
        at: 25000,
        text: 'I already plan tomorrow’s stock in a spreadsheet. What would make switching worth my time?',
      },
      {
        id: 'sample-4',
        speaker: 'user',
        at: 34000,
        text: 'You upload the CSV you already export. We give you a preparation checklist, so there is no new inventory system to learn.',
      },
      {
        id: 'sample-5',
        speaker: 'operator',
        at: 56000,
        text: 'How will you know whether your forecasts reduce waste during the pilot?',
      },
      {
        id: 'sample-6',
        speaker: 'user',
        at: 65000,
        text: 'We have not measured a reduction yet. In our next pilot, we will compare four weeks of waste by item against each shop’s baseline, and track stockouts too.',
      },
    ],
    feedback: {
      source: 'sample',
      summary:
        'Your workflow is easy to understand. The next step is separating customer interest from willingness to pay, then showing how the pilot will test your assumptions.',
      items: [
        {
          id: 'sample-f1',
          kind: 'unsupported',
          criterion: 'evidence',
          title: 'Interest is not a purchase commitment',
          detail:
            'The interviews establish that waste is painful, but your answer does not establish that shops will pay $79.',
          suggestion:
            'Name the evidence you have, acknowledge what you do not know, and propose a paid pilot or pricing test.',
          turnIds: ['sample-1', 'sample-2'],
          questionId: 'sample-1',
        },
        {
          id: 'sample-f2',
          kind: 'strength',
          criterion: 'clarity',
          title: 'Make the switch feel small',
          detail:
            'Your answer connects the existing CSV export to a concrete preparation checklist.',
          suggestion: 'Keep this explanation. Add a measured setup time when you have one.',
          turnIds: ['sample-3', 'sample-4'],
          questionId: 'sample-3',
        },
        {
          id: 'sample-f3',
          kind: 'strength',
          criterion: 'specificity',
          title: 'A testable pilot plan',
          detail:
            'You name a four-week comparison, a baseline, and stockouts as a balancing measure while acknowledging there are no results yet.',
          suggestion: 'Define the baseline period and waste unit before the pilot starts.',
          turnIds: ['sample-5', 'sample-6'],
          questionId: 'sample-5',
        },
      ],
    },
  };
}
