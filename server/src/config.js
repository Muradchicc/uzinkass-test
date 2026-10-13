import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(serverDir, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  appsScriptUrl: (process.env.APPS_SCRIPT_URL ?? '').trim(),
  appsScriptToken: (process.env.APPS_SCRIPT_TOKEN ?? '').trim(),
  port: Number(process.env.PORT) || 3000,
  questionCount: Number(process.env.QUESTION_COUNT) || 10,
  dataDir: path.join(serverDir, 'data'),
  fakeDataFile: path.join(serverDir, 'fake-data.json'),
  clientDist: path.resolve(serverDir, '..', 'client', 'dist'),
  // Savollar Google Sheets'dan qayta o'qiladigan oraliq
  questionsRefreshMs: 5 * 60 * 1000,
  // Yuborilmagan natijalarni qayta yuborish oralig'i
  flushIntervalMs: 30 * 1000,
  sessionTtlMs: 3 * 60 * 60 * 1000,
};
