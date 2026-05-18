import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Resolve the path to better-sqlite3's native addon.
 *
 * In a normal Node install (dev / `npm i -g`), return `undefined` so
 * better-sqlite3 uses its usual `bindings` resolution.
 *
 * Inside a pkg self-contained binary, `bindings`' dynamic filesystem
 * probing cannot find the addon. We instead embed `better_sqlite3.node`
 * as a pkg asset next to the bundle, extract it once to a real temp file
 * (pkg can `readFileSync` snapshot assets but `dlopen` needs a real path),
 * and hand that path to better-sqlite3 via its `nativeBinding` option.
 */
export function resolveNativeBinding(): string | undefined {
  // `process.pkg` is only set inside a pkg executable.
  if (!(process as unknown as { pkg?: unknown }).pkg) return undefined;

  const assetPath = fileURLToPath(new URL('./better_sqlite3.node', import.meta.url));
  const bytes = readFileSync(assetPath);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

  const cacheDir = join(tmpdir(), 'spearcode-native', hash);
  const target = join(cacheDir, 'better_sqlite3.node');

  if (!existsSync(target) || statSync(target).size !== bytes.length) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(target, bytes);
  }
  return target;
}
