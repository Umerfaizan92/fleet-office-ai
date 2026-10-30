// Builds the only bundled front-end file: the Three.js hero, tree-shaken and minified.
// Everything else in saas/ds is plain CSS and JavaScript served as written.
//   npm run build:ds
import { build } from 'esbuild';
import fs from 'node:fs';
import zlib from 'node:zlib';
const result = await build({
  entryPoints: ['saas/ds/src/hero-3d.mjs'], outfile: 'saas/ds/hero-3d.js', bundle: true, format: 'esm', minify: true,
  target: ['es2020'], legalComments: 'eof', metafile: true, logLevel: 'warning'
});
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`saas/ds/hero-3d.js ${(bytes / 1024).toFixed(1)} KB (minified)`);

// Pre-compressed copies for every design-system file, served by src/public-site.js. Rebuilt every time so they never go stale.
for (const name of fs.readdirSync('saas/ds').filter((f) => /\.(js|css)$/.test(f))) {
  const src = fs.readFileSync(`saas/ds/${name}`);
  fs.writeFileSync(`saas/ds/${name}.br`, zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  fs.writeFileSync(`saas/ds/${name}.gz`, zlib.gzipSync(src, { level: 9 }));
}
console.log('Pre-compressed design-system files written (.br, .gz).');
