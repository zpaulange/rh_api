// Compilation de production : un seul fichier ESM par point d’entrée,
// dépendances npm laissées externes (installées avec « npm ci --omit=dev »).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const externes = Object.keys(pkg.dependencies ?? {});

for (const [entree, sortie] of [
  ['src/serveur.ts', 'dist/serveur.js'],
  ['src/scripts/migrer.ts', 'dist/migrer.js'],
  ['src/scripts/seed.ts', 'dist/seed.js'],
  ['src/scripts/initialiser.ts', 'dist/initialiser.js'],
]) {
  await build({
    entryPoints: [entree],
    outfile: sortie,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: true,
    external: externes,
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });
  console.log(`[build] ${sortie}`);
}
