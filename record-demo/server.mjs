// Record-at-submit LOCAL DEMO (see README.md): serves the demo pages on :8795 and answers a few local helper calls for
// them. The record lookups use the local Attestio dashboard's real Inspect API (:3016) with a local test API key that
// stays here on the server side (never sent to the browser). Local test data only — it does not work on zippybk.com.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, 'site');
// Where the local dashboard keeps its records, and where it runs (override with ATTESTIO_DATA / ATTESTIO_DASHBOARD).
const DATA = process.env.ATTESTIO_DATA ?? '/Users/dev/Desktop/Attesio/attestio/dashboard/.data';
const DASH = process.env.ATTESTIO_DASHBOARD ?? 'http://localhost:3016';
const PORT = 8795;
const KEY_FILE = path.join(HERE, '.apikey.json');
const LOG = path.join(HERE, 'records.log'); // every record ID the demo looked up — for the clean-up afterwards
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 22-char record ID → stored UUID (exact base64url decode), or null. */
function toUuid(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const hex = Buffer.from(id, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); } catch { return null; } };
const apiKey = () => { try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key; } catch { return null; } };

/** The hash a client sends to have Inspect confirm an email (never the email itself): SHA-256 of the trimmed,
 *  lower-cased address — the dashboard's normalizeForHash for emails. */
const emailHash = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

async function inspectOnce(recordId, email) {
  const key = apiKey();
  if (!key) return { status: 0, body: { error: 'no demo API key (run the key step)' } };
  try {
    const body = { record_id: recordId, ...(email ? { pii: { email: emailHash(email) } } : {}) };
    const r = await fetch(`${DASH}/v1/inspect`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, body: { error: String(e?.message ?? e) } };
  }
}

/** What the stored record holds — read from the local store the dev server writes. */
function recordDetails(uuid) {
  const lead = readJson(`leads/${uuid}.json`);
  if (!lead) return null;
  const s = lead.session ?? {};
  const ts = lead.traffic_source ?? {};
  return {
    answers: lead.form_data ?? {},
    started_at: s.started_at ?? null,
    ended_at: s.ended_at ?? null,
    duration_ms: s.duration_ms ?? null,
    events: s.total_events ?? null,
    landing_page: ts.landing_url ? new URL(ts.landing_url).pathname : null,
    came_from: ts.referrer ?? null,
    source_category: ts.category ?? null,
    clicks: lead.interaction_stats?.mouse_clicks ?? null,
    typing: lead.interaction_stats?.text_inputs ?? null,
    counts_from: lead.interaction_stats?.source ?? null,
    processed_at: lead.processed_at ?? null,
    site_key: lead.site_key ?? null,
  };
}

async function result(recordId, since, email) {
  const uuid = toUuid(recordId);
  if (!uuid) return { error: 'not a record ID' };
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${recordId} ${uuid}\n`);
  // Ask Inspect the way a client's server would, right away; if it's not there yet, keep asking (up to 10 s).
  const asked = Date.now();
  let tries = 0;
  let found = null;
  let last = null;
  while (Date.now() - asked < 10_000) {
    tries += 1;
    last = await inspectOnce(recordId, email);
    if (last.status === 200) { found = Date.now(); break; }
    await sleep(100);
  }
  const s = last?.body?.session ?? null;
  // The stored record can trail Inspect by a moment (a later step's version is rebuilt after the page accepts it):
  // give it up to 3 s to hold the email this step sent, so the answers below match what Inspect said.
  let record = recordDetails(uuid);
  for (let i = 0; email && i < 30 && record?.answers?.email !== email; i++) { await sleep(100); record = recordDetails(uuid); }
  return {
    record_id: recordId,
    inspect: {
      status: last?.status ?? 0,
      tries,
      ms_after_click: found && since ? found - since : null,
      ms_after_asking: found ? found - asked : null,
      begin: s?.begin_timestamp ?? null,
      end: s?.end_timestamp ?? null,
      page: s?.page?.url ?? null,
      referrer: s?.page?.referrer ?? null,
      error: last?.status === 200 ? null : (last?.body?.error ?? last?.body?.message ?? null),
      email_confirmed: email ? (last?.body?.pii_match?.email ?? null) : null,
    },
    record,
  };
}

/** For the email-check form: is this visit a lead yet, waiting for the page's answer, or turned down? */
function status(recordId) {
  const uuid = toUuid(recordId);
  if (!uuid) return { error: 'not a record ID' };
  const check = readJson(`submit-checks/${uuid}.json`);
  const failure = readJson(`failures/${uuid}.json`);
  return {
    lead: fs.existsSync(path.join(DATA, 'leads', `${uuid}.json`)),
    pending: fs.existsSync(path.join(DATA, 'submit-pending', `${uuid}.json`)),
    verdict: check?.verdict ?? null,
    failure: failure?.client_reason ?? failure?.reason ?? null,
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  try {
    if (url.pathname === '/demo-api/result') return json(200, await result(url.searchParams.get('id'), Number(url.searchParams.get('since')) || null, url.searchParams.get('email')));
    if (url.pathname === '/demo-api/status') return json(200, status(url.searchParams.get('id')));
    if (url.pathname === '/demo-api/fake-crm') { // the "client's server" a script-sent form posts to
      let body = '';
      for await (const chunk of req) body += chunk;
      await sleep(400);
      return json(200, { ok: true, received: Object.keys(JSON.parse(body || '{}')) });
    }
    const file = path.join(SITE, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => console.log(`record-at-submit demo on http://localhost:${PORT} (dashboard ${DASH})`));
