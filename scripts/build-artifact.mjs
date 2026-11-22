/**
 * Bundles the app into ONE body-level HTML file for publishing as a Claude
 * Artifact.
 *
 * An Artifact wraps the published file in its own <!doctype>/<head>/<body>
 * skeleton, so the output deliberately has no document tags — just <title>,
 * <style>, the mount point and the script. Everything is inlined because the
 * Artifact frame only loads scripts from an allowlist of CDNs.
 *
 *   npm run build:artifact && node scripts/build-artifact.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist-artifact');
const OUT = join(DIST, 'page.html');

const files = await readdir(DIST);
const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

if (jsFiles.length !== 1) {
  throw new Error(
    `Expected exactly one JS chunk in dist-artifact, found: ${jsFiles.join(', ') || 'none'}. ` +
      'Inlining assumes a single bundle — check the rollup output options in vite.config.ts.',
  );
}

const js = await readFile(join(DIST, jsFiles[0]), 'utf8');
const css = cssFiles.length ? await readFile(join(DIST, cssFiles[0]), 'utf8') : '';

// `</script>` inside the bundle would close the inline tag early.
const safeJs = js.replaceAll('</script>', '<\\/script>');

const page = `<title>Bead Ledger</title>
<style>
${css}
</style>

<div id="root"></div>

<script type="module">
${safeJs}
</script>
`;

await writeFile(OUT, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`Wrote ${OUT} (${kb} KB inlined, limit 16384 KB)`);
if (Buffer.byteLength(page) > 16 * 1024 * 1024) {
  throw new Error('Page exceeds the 16MB Artifact limit.');
}
