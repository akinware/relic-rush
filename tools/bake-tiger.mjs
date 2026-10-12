// Bakes the tiger (tiger/species.js) into tiger-<quality>.animal so the game loads it instantly.
//   node tools/bake-tiger.mjs [low|medium] ...
import fs from 'node:fs';
import { buildAnimalData, writeBake } from '../vendor/procedural-animals/src/index.js';
import tiger from '../tiger/species.js';

const SEED = 7;
for (const q of process.argv.slice(2).length ? process.argv.slice(2) : ['low']) {
  const t = Date.now();
  const d = await buildAnimalData(tiger, { seed: SEED, quality: q, worker: false });
  const buf = writeBake(d);
  fs.writeFileSync(`tiger-${q}.animal`, new Uint8Array(buf));
  console.log(`tiger-${q}.animal  ${(buf.byteLength / 1048576).toFixed(2)} MB  ${d.nV} vertices  ${Date.now() - t} ms`);
}
