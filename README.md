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
