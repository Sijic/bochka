import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const srcDir = path.join(root, 'src');

const jsFiles = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(srcDir, f));

let errors = 0;

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    console.error(`[SYNTAX ERROR] ${path.relative(root, file)}:\n${err.stderr?.toString() || err.message}`);
    errors++;
  }
}

const dictPath = path.join(srcDir, 'dict.json');
if (fs.existsSync(dictPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    for (const lang of ['ru', 'kz', 'en']) {
      if (!parsed[lang]) {
        console.error(`[DICT ERROR] Missing language "${lang}" in src/dict.json`);
        errors++;
      }
    }
  } catch (err) {
    console.error(`[JSON ERROR] src/dict.json: ${err.message}`);
    errors++;
  }
} else {
  console.error('[DICT ERROR] src/dict.json not found');
  errors++;
}

if (errors > 0) {
  process.exit(1);
}
console.log(`✓ Lint passed: ${jsFiles.length} JS modules + src/dict.json (RU/KZ/EN) verified.`);
