import path from 'node:path';
import { Store } from './store.js';
import { createApp } from './app.js';
const app = createApp(new Store(path.resolve(process.env.DATA_DIR || '../../data')));
await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4000) });
console.log('HotSeat session service is ready.');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
