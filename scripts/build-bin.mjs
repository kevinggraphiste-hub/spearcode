#!/usr/bin/env node
/**
 * SpearCode portable binary builder.
 *
 * Pipeline:
 *   1. esbuild bundles the ESM/TS CLI into a single ESM file
 *      (native / optional modules kept external: better-sqlite3, ws).
 *   2. @yao-pkg/pkg compiles that bundle into a self-contained executable
 *      that runs WITHOUT Node installed. better-sqlite3's prebuilt .node
 *      is embedded and loaded via its `nativeBinding` option at runtime
 *      (see src/core/native-binding.ts).
 *
 * Uses the esbuild & pkg JavaScript APIs directly — no `npx` spawn — so
 * the build is identical on Linux, macOS and Windows runners.
 *
 * Usage:
 *   node scripts/build-bin.mjs                 # host target
 *   node scripts/build-bin.mjs <pkg-target>    # e.g. node20-win-x64
 */
import { mkdirSync, rmSync, existsSync, chmodSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { exec as pkgExec } from '@yao-pkg/pkg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const bundle = join(buildDir, 'spearcode.mjs');
const outDir = join(root, 'release');

function hostTarget() {
  const os = { darwin: 'macos', win32: 'win', linux: 'linux' }[process.platform] ?? 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${os}-${arch}`;
}
const target = process.argv[2] || `node20-${hostTarget()}`;

// ── 1. Clean + bundle ──
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// pkg's prebuilt Node base ships without full ICU: calling the native
// Intl.Segmenter (used by Ink's text-width libs) SEGFAULTS V8 instead of
// throwing. Replace it with a pure-JS code-point segmenter, injected
// before any module evaluates so the broken builtin is never reached.
const intlSegmenterPolyfill =
  ';(function(){try{var G=globalThis;if(!G.Intl)G.Intl={};' +
  'function S(l,o){this._g=(o&&o.granularity)||"grapheme";this._l=l;}' +
  'S.prototype.resolvedOptions=function(){return{locale:(Array.isArray(this._l)?this._l[0]:this._l)||"en",granularity:this._g};};' +
  'S.prototype.segment=function(s){s=String(s);' +
  'var p=this._g==="grapheme"?Array.from(s):s.split(/(\\s+)/).filter(function(x){return x.length;});' +
  'return {[Symbol.iterator]:function(){var i=0,off=0;return {next:function(){' +
  'if(i>=p.length)return{value:undefined,done:true};' +
  'var g=p[i++],ix=off;off+=g.length;' +
  'return{value:{segment:g,index:ix,input:s,isWordLike:/\\w/.test(g)},done:false};},' +
  '[Symbol.iterator]:function(){return this;}};}};};' +
  'G.Intl.Segmenter=S;}catch(e){}})();';

console.log(`• esbuild → ${bundle}`);
await build({
  entryPoints: [join(root, 'src/cli/index.ts')],
  bundle: true,
  platform: 'node',
  // ESM output: Ink's yoga-layout dependency uses top-level await,
  // which is only valid in ESM (not CJS).
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  // Native addon — embedded separately, never bundled by esbuild.
  // ws is an optional collab dep, lazily required only when used.
  external: ['better-sqlite3', 'ws'],
  // Ink dev-only devtools integration: alias to a no-op stub so the
  // dead code path resolves at bundle time.
  alias: { 'react-devtools-core': join(root, 'scripts', 'stub-react-devtools-core.mjs') },
  // ESM bundles have no CJS `require`; reinstate it for the few
  // `require()` call-sites (collab `ws`, node:fs in testGen).
  banner: { js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);" + intlSegmenterPolyfill },
  logLevel: 'warning',
});

if (!existsSync(bundle)) {
  console.error('✗ esbuild did not produce the bundle');
  process.exit(1);
}

// ── 2. Embed the better-sqlite3 native addon next to the bundle ──
// bindings' dynamic probing can't find it inside a pkg snapshot, so we
// ship it as a flat asset and load it via better-sqlite3's nativeBinding
// option (see src/core/native-binding.ts).
const addonSrc = join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');
if (!existsSync(addonSrc)) {
  console.error(`✗ Missing native addon: ${addonSrc}\n  Run npm install on the target platform first.`);
  process.exit(1);
}
copyFileSync(addonSrc, join(buildDir, 'better_sqlite3.node'));

// pkg only reads asset config reliably via an explicit --config file
// whose directory is the asset base.
const pkgConfig = join(buildDir, 'pkg.config.json');
writeFileSync(pkgConfig, JSON.stringify({
  name: 'spearcode',
  bin: 'spearcode.mjs',
  pkg: { assets: ['better_sqlite3.node'] },
}, null, 2));

// ── 3. Compile to a self-contained executable ──
const isWin = target.includes('win');
const base = `spearcode-${target.replace(/^node20-/, '')}`;
const outFile = join(outDir, isWin ? `${base}.exe` : base);

console.log(`• pkg → ${outFile} (${target})`);
await pkgExec([
  bundle,
  '--config', pkgConfig,
  '--targets', target,
  '--output', outFile,
  '--compress', 'GZip',
]);

if (!existsSync(outFile)) {
  console.error(`✗ pkg did not produce ${outFile}`);
  process.exit(1);
}
if (!isWin) chmodSync(outFile, 0o755);

console.log(`\n✓ Portable binary: ${outFile}`);
