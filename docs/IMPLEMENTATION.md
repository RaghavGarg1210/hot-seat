# Implementation status

The initial local preview implements the approved startup-pitch workflow: preparation, an animated three-person panel, voice/text session controls, grounded debriefs, question retries, local history, exports, deletion, and a key-free scripted replay.

The repository uses Next.js/React, Fastify, shared Zod contracts, SQLite, LiveKit Agents, Jev decision requests, and OpenAI preparation/dialogue/feedback/STT/TTS adapters. Assets and fonts are bundled locally. Docker Compose and native development commands are documented.

See [verification status](VERIFICATION.md) for tested behavior and the outstanding live-provider and Docker acceptance checks. No live performance or model-quality claim is made without that evidence.

The GitHub repository is private. Publishing remains a separate owner decision.
