// Copies the example environment file into place if no real environment.ts
// exists yet. Used by the `build:e2e` script so a fresh checkout can build
// without manual setup. Never overwrites an existing environment.ts.

import { copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const target = join(process.cwd(), 'src', 'environments', 'environment.ts');
const source = join(process.cwd(), 'src', 'environments', 'environment.ts.example');

try {
  await access(target);
  console.log('environment.ts already present — leaving it untouched.');
} catch {
  await copyFile(source, target);
  console.log('Copied environment.ts.example → environment.ts for the e2e build.');
}
