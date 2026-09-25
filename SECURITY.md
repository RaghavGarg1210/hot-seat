# Security and data

HotSeat v0.1 is intended for a single user on localhost. Do not expose it to the internet or use the development LiveKit credentials on a shared server. Remote deployment requires authentication, TLS, suitable WebRTC networking, and a separate security review.

Provider keys are server-side environment variables. Pitch text, speech, and transcripts are sent to the configured providers when those features run. Local sessions are saved in SQLite; optional recordings are saved as WebM. Session deletion removes its database record, metrics, and recording. Model-provider retention is governed by that provider, not by local deletion.

Do not put sensitive examples or secrets into public issues. Report a suspected issue to the repository owner with a minimal, sanitized reproduction.
