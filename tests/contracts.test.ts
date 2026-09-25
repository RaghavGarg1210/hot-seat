import { describe, it, expect } from 'vitest';
import { CreateSession, SAMPLE_PITCH, formatTime } from '@hotseat/shared';
describe('session boundary', () => {
  it('rejects unsupported session lengths and empty pitch context', () => {
    expect(CreateSession.safeParse({ pitch: SAMPLE_PITCH, duration: 60 }).success).toBe(false);
    expect(CreateSession.safeParse({ pitch: { ...SAMPLE_PITCH, summary: '' } }).success).toBe(
      false,
    );
  });
  it('applies safe recording defaults', () => {
    expect(CreateSession.parse({ pitch: SAMPLE_PITCH }).recording).toBe(false);
  });
  it('clamps expired timers', () => {
    expect(formatTime(-100)).toBe('0:00');
  });
});
