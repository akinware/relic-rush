// Builds the game into dist/ (used by Vercel for the web version and by Capacitor for the Android app).
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync, copyFileSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

await build({
  entryPoints: ['game.js'],
  bundle: true, minify: true, splitting: true, format: 'esm', target: 'es2020',
  outdir: 'dist', chunkNames: 'chunk-[hash]', logLevel: 'warning',
});

const STATIC = /\.(glb|woff2|png|webmanifest|txt|animal|mp3|ogg|jpg)$/;
const files = ['index.html', 'privacy.html', 'sw.js', ...readdirSync('.').filter((f) => STATIC.test(f) && !/^(feature-graphic|screenshot|icon-source|android-|play-)/.test(f))];
for (const f of files) if (existsSync(f)) copyFileSync(f, 'dist/' + f);
// a fresh cache name per build so web players get updates
writeFileSync('dist/sw.js', readFileSync('dist/sw.js', 'utf8').replace('__BUILD__', Date.now().toString(36)));

const all = readdirSync('dist');
const size = all.reduce((n, f) => n + statSync('dist/' + f).size, 0);
console.log(`built dist/: ${all.length} files, ${(size / 1048576).toFixed(1)} MB`);
