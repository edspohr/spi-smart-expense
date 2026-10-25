// Verifies that the Gemini models used by extractReceipt answer on Vertex AI
// in the configured region, using your gcloud Application Default Credentials.
//
//   npm run vertex:check -- --project spi-smart-expense [--location global]

import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { GoogleGenAI } = requireFromFunctions('@google/genai');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : fallback;
};
const project = opt('--project', process.env.GCLOUD_PROJECT);
const location = opt('--location', 'global');
if (!project) {
  console.error('Pass --project <gcp-project-id>');
  process.exit(1);
}

const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const ai = new GoogleGenAI({ vertexai: true, project, location });

let failures = 0;
for (const model of MODELS) {
  const started = Date.now();
  try {
    const res = await ai.models.generateContent({ model, contents: 'Responde solo: ok' });
    console.log(`ok   ${model} (${Date.now() - started} ms): ${String(res.text ?? '').trim().slice(0, 40)}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${model}: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
  }
}
process.exit(failures ? 1 : 0);
