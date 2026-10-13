import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = (name) => path.join(config.dataDir, name);

export function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(name, value) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  // Avval vaqtinchalik faylga yozamiz — elektr o'chsa ham fayl buzilmaydi
  const tmp = file(`${name}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
}
