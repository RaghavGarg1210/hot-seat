import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { sampleSession } from '../apps/server/src/sample';
import { baselineDecision, decide } from '../apps/server/src/providers';
const fixtures = JSON.parse(
  readFileSync(new URL('../evals/pitch-exchanges.json', import.meta.url), 'utf8'),
) as { text: string; persona: string; challenge: boolean }[];
const live = process.argv.includes('--live');
if (live && !process.env.TYPESAFE_API_KEY)
  throw new Error('Live evaluation needs TYPESAFE_API_KEY in .env.');
const session = sampleSession();
const rows = [];
for (const fixture of fixtures) {
  const baseline = baselineDecision(fixture.text);
  const start = performance.now();
  const prediction = live ? await decide(session, fixture.text) : null;
  rows.push({
    text: fixture.text,
    expected: { persona: fixture.persona, challenge: fixture.challenge },
    baseline,
    jev: prediction,
    jevMs: prediction ? Math.round(performance.now() - start) : null,
  });
}
const accuracy = (key: 'baseline' | 'jev') => {
  const available = rows.filter((r) => r[key]);
  return available.length
    ? {
        persona:
          available.filter((r) => r[key]?.persona === r.expected.persona).length / available.length,
        challenge:
          available.filter((r) => r[key]?.challenge === r.expected.challenge).length /
          available.length,
      }
    : null;
};
const latencies = rows
  .map((r) => r.jevMs)
  .filter((n): n is number => n !== null)
  .sort((a, b) => a - b);
const report = {
  createdAt: new Date().toISOString(),
  fixtures: rows.length,
  baseline: accuracy('baseline'),
  jev: accuracy('jev'),
  jevLatencyP95: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
  note: 'Small hand-labeled smoke set, not a general accuracy benchmark. No voice end-to-end latency measured here.',
  rows,
};
mkdirSync('evals/results', { recursive: true });
writeFileSync('evals/results/latest.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
