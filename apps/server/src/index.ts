import Fastify from 'fastify';
const app = Fastify();
app.get('/api/health', async () => ({ status: 'ok' }));
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 4000) });
