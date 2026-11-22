/**
 * Tiny zero-dependency persistence server.
 *
 * Your data is a single human-readable JSON file at data/beads.json, written
 * atomically with rolling backups. Nothing leaves this machine. If you ever
 * stop using this app, that file is still a plain, documented JSON document.
 */
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const STATE_FILE = join(DATA_DIR, 'beads.json');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const IMAGE_DIR = join(DATA_DIR, 'images');
const DIST_DIR = join(ROOT, 'dist');

const PORT = Number(process.env.BEAD_API_PORT ?? 8787);
const MAX_BODY = 32 * 1024 * 1024;
const KEEP_BACKUPS = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

await mkdir(DATA_DIR, { recursive: true });
await mkdir(BACKUP_DIR, { recursive: true });
await mkdir(IMAGE_DIR, { recursive: true });

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Write via a temp file + rename so a crash mid-write cannot corrupt the data. */
async function writeStateAtomic(text) {
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, text, 'utf8');
  try {
    await stat(STATE_FILE);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(BACKUP_DIR, `beads-${stamp}.json`), await readFile(STATE_FILE, 'utf8'));
  } catch {
    // No prior file: nothing to back up.
  }
  await rename(tmp, STATE_FILE);
  await pruneBackups();
}

async function pruneBackups() {
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      await unlink(join(BACKUP_DIR, f));
    }
  } catch {
    // Pruning is best-effort.
  }
}

function safeJoin(base, candidate) {
  const target = normalize(join(base, candidate));
  return target.startsWith(base) ? target : null;
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  let file = safeJoin(DIST_DIR, rel);
  if (!file) return send(res, 403, { error: 'Forbidden' });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(DIST_DIR, 'index.html'); // SPA fallback
  }
  try {
    await stat(file);
  } catch {
    return send(res, 404, { error: 'Not built yet. Run: npm run build' });
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === '/api/state' && req.method === 'GET') {
      try {
        return send(res, 200, await readFile(STATE_FILE, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return send(res, 200, 'null');
        throw err;
      }
    }

    if (path === '/api/state' && req.method === 'PUT') {
      const text = (await readBody(req)).toString('utf8');
      JSON.parse(text); // reject anything that is not valid JSON before writing
      await writeStateAtomic(text);
      return send(res, 200, { ok: true, bytes: text.length });
    }

    if (path === '/api/images' && req.method === 'POST') {
      const ct = req.headers['content-type'] ?? '';
      const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
      const buf = await readBody(req);
      if (buf.length === 0) return send(res, 400, { error: 'Empty upload' });
      const name = `${randomUUID()}${ext}`;
      await writeFile(join(IMAGE_DIR, name), buf);
      return send(res, 201, { url: `/api/images/${name}` });
    }

    if (path.startsWith('/api/images/') && req.method === 'GET') {
      const file = safeJoin(IMAGE_DIR, path.slice('/api/images/'.length));
      if (!file) return send(res, 403, { error: 'Forbidden' });
      try {
        await stat(file);
      } catch {
        return send(res, 404, { error: 'No such image' });
      }
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return createReadStream(file).pipe(res);
    }

    if (path === '/api/health') {
      return send(res, 200, { ok: true, dataFile: STATE_FILE });
    }

    if (path.startsWith('/api/')) return send(res, 404, { error: 'Unknown endpoint' });

    return await serveStatic(res, path);
  } catch (err) {
    return send(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`bead-ledger data server on http://127.0.0.1:${PORT}`);
  console.log(`  data file: ${STATE_FILE}`);
});
