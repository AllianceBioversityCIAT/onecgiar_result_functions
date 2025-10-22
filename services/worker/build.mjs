import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.mts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/index.js',
  packages: 'bundle'
});
