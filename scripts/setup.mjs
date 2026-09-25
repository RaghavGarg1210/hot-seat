import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = new URL('../.env', import.meta.url);
let contents = existsSync(file)
  ? readFileSync(file, 'utf8')
  : readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
if (!/^INTERNAL_TOKEN=[a-f0-9]{64}$/m.test(contents)) {
  contents =
    contents.replace(/^INTERNAL_TOKEN=.*\n?/m, '') +
    `INTERNAL_TOKEN=${randomBytes(32).toString('hex')}\n`;
}
writeFileSync(file, contents, { mode: 0o600 });
console.log(
  'Local configuration is ready. Add your OpenAI and TypeSafe keys to .env. Never commit that file.',
);
