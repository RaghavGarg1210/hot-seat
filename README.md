# HotSeat

Startup pitch practice under pressure.

A local browser app for rehearsing difficult questions from an investor, a customer, and an operator.

## Development

Requires Node.js 22.23 or newer and npm.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:3000. This initial scaffold provides a landing page, a health endpoint, and shared validated contracts. Practice sessions are still being integrated.

Run `npm run check` for types, lint, and tests, or `npm run build` for a production build.

Never commit `.env` or local session data. Licensed under [MIT](LICENSE).

## Session service

The API now supports reviewed pitch context, text-based PDF extraction, panel control, grounded feedback, retries, history, exports, deletion, and a scripted sample. The interface is still being connected.

Live preparation and dialogue require `OPENAI_API_KEY` in `.env`; `TYPESAFE_API_KEY` enables Jev reactions. Pitch context is sent to configured providers. Keys stay server-side and transcripts are stored locally.
