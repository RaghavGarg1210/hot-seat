# Verification status

UI refresh checked locally on 2026-09-25 with Node.js 22.23.0 on macOS: type checking, lint, 24 unit/integration tests, seven browser tests, and the production build passed. The original clean-install, Compose configuration, voice-plugin, and dependency-audit checks below were performed on 2026-09-24.

## Passing

- TypeScript checking and ESLint.
- 24 unit/integration tests: controller cancellation and duplicate handling, pressure rules, paused timers, stale decisions, feedback references, provider-failure behavior, origin/host checks, authenticated worker endpoints, local persistence, deletion, PDF extraction and limits, and the session-to-retry lifecycle with deterministic provider fixtures.
- Seven Playwright browser tests: sample/debrief/evidence/export/deletion, setup and disclosure controls, small-screen/reduced-motion behavior, and automatic transition to the debrief on expiry, immediate delivery of real session events through the web proxy, keyboard-operated panel previews and selected-state controls, and phone/tablet layout coverage.
- Production Next.js build and service type checking.
- Clean temporary installation using `npm ci`, `npm run setup`, `npm run check`, and `npm run build`.
- Compose configuration validation and existence of the pinned LiveKit image.
- Local voice-activity plugin asset preparation.
- Dependency audit: zero reported vulnerabilities at verification time.
- Rendered overview, practice room, preparation, and debrief screenshots inspected.

## Still needs live validation

OpenAI and TypeSafe keys are not configured in this environment. No claim is made that a real microphone session, provider account/model access, provider response quality, or the p95 latency targets have passed. A five-minute live conversation covering interruptions, background noise, reconnection, and optional recording remains required.

Docker's engine was not running, so an actual Compose image build and container startup were not exercised. The native clean-start path was exercised instead. Native SQLite currently emits Node.js's experimental-feature notice.

The sample and walkthrough are scripted and silent; they demonstrate the interface, not measured live inference.

## Evaluation

`evals/results/latest.json` contains the baseline run on twelve hand-labeled examples. Jev results and latency are null until `npm run eval -- --live` runs with a valid key. These fixtures are a regression smoke set, not a general model-quality benchmark.

## Live acceptance procedure

1. Configure provider keys in `.env`; restart the service and voice worker.
2. Prepare a synthetic brief and a text-based PDF. Check the extracted context before starting.
3. Complete a five-minute voice session in each pressure mode. Check that supportive mode does not interrupt mid-speech and that only one panelist speaks.
4. Interrupt a panelist, pause/resume, skip a question, disconnect/reconnect, and switch to text. No canceled question should play afterward.
5. Repeat with recording enabled. Confirm microphone and panel audio playback, then delete the session and confirm the recording is unavailable.
6. Review every critique against its cited transcript. Retry a question and verify the original answer and new attempt are linked.
7. Export session metrics and report actual p50/p95 reaction and response-audio latency. Run the labeled Jev comparison and retain its results.
