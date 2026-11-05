// Shared bits for the local record-at-submit demo pages. Reads only what any page could see: the hidden
// attestio_record_id field the tracker adds to every form (reading window.Attestio early would settle the ID itself).
window.Demo = (() => {
  const DASH = 'http://localhost:3016';
  const ACCOUNTS = { dev: 'a1b2c3d4e5f6a1b2c3d4e5f6', dev2: '11ba444f15c26599911a96a5' };

  /** Load our tracker for an account, the way a client's page does (async tag, opted in to server record IDs). */
  function loadTracker(account) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `${DASH}/attestio.js`;
    s.setAttribute('data-site-key', ACCOUNTS[account]);
    s.setAttribute('data-vertical', 'debt_relief');
    s.setAttribute('data-record-ids', 'server');
    document.head.appendChild(s);
  }

  /** The record ID the tracker put on the page's forms ('' until it's settled). */
  const currentId = () => document.querySelector('input[name="attestio_record_id"]')?.value ?? '';

  /** Keep the header badge showing the page's record ID. */
  function watchRecordId(onChange) {
    const badge = document.getElementById('rid');
    let last = null;
    const tick = () => {
      const id = currentId();
      if (id !== last) {
        last = id;
        if (badge) badge.textContent = id ? `Record ID: ${id}` : 'Record ID: waiting for our server…';
        if (onChange) onChange(id);
      }
    };
    tick();
    return setInterval(tick, 200);
  }

  /** Stamp the moment the visitor submitted on the form itself (before our tracker can hold the submit), so the
   *  thank-you page can say how long after the click Inspect found the record. */
  function stampSubmitTime() {
    window.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.querySelector('input[name="demo_t"]')) return;
      const t = document.createElement('input');
      t.type = 'hidden';
      t.name = 'demo_t';
      t.value = String(Date.now());
      form.appendChild(t);
    }, true);
  }

  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The FIRST Inspect answer for each record (a refresh re-reads the record, not the timing of that first ask).
  const firstInspect = {};

  /** Ask the demo helper what Inspect and the record say, and show it. */
  async function showResult(el, recordId, since, extra = {}) {
    el.innerHTML = '<p class="wait">Asking Inspect for this record, the way a client\'s server would…</p>';
    const r = await fetch(`/demo-api/result?id=${encodeURIComponent(recordId)}&since=${since || ''}`).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) { el.innerHTML = `<p class="no">${esc(r.error)}</p>`; return r; }
    if (!firstInspect[recordId] && r.inspect.status === 200) firstInspect[recordId] = r.inspect;
    const i = firstInspect[recordId] ?? r.inspect, rec = r.record;
    const found = i.status === 200;
    const answers = rec ? Object.entries(rec.answers).filter(([k]) => !['demo_t', 'demo', 'attestio_record_id', 'certificate_id', 'attestio_epilogue', 's1', 'wipe'].includes(k)) : [];
    const lengthS = rec?.duration_ms != null ? Math.round(rec.duration_ms / 1000) : null;
    el.innerHTML = `
      <dl>
        <dt>Record ID the form sent</dt><dd class="mono">${esc(recordId)}</dd>
        <dt>Inspect</dt><dd>${found
          ? `<span class="yes">Found ${i.tries === 1 ? 'on the first try' : `on try ${i.tries}`}</span> — Inspect answered in ${esc(i.ms_after_asking)} ms${i.ms_after_click != null ? `<br><span class="note">${i.ms_after_click} ms after your click — that includes the save, the page sending the answers and this page loading</span>` : ''}`
          : `<span class="no">Not found</span> (${esc(i.status)}${i.error ? `: ${esc(i.error)}` : ''})`}</dd>
        ${extra.rows ?? ''}
        <dt>Answers in the record</dt><dd>${answers.length ? answers.map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join('<br>') : '—'}</dd>
        <dt>Visit started</dt><dd>${time(rec?.started_at)}${lengthS != null ? ` (visit length ${lengthS} s)` : ''}</dd>
        <dt>Landing page</dt><dd>${esc(rec?.landing_page)}</dd>
        <dt>Came from</dt><dd>${esc(rec?.came_from)} (${esc(rec?.source_category)})</dd>
        <dt>Clicks / typing</dt><dd>${esc(rec?.clicks)} / ${esc(rec?.typing)}${rec?.counts_from ? ` <span class="note">(counted by ${rec.counts_from === 'tracker' ? 'the tracker, at submit' : 'the stored recording'})</span>` : ''}</dd>
      </dl>
      <p class="note">The record keeps being refined in the background for a few seconds (replay, counts from the recording). <a href="#" data-refresh>Refresh</a> ·
      Dashboard: <a href="http://localhost:3016/leads/${encodeURIComponent(recordId)}" target="_blank">open the record</a> (log in as ${rec?.site_key === ACCOUNTS.dev2 ? 'dev2@test.com' : 'dev@test.com'}).</p>`;
    el.querySelector('[data-refresh]')?.addEventListener('click', (e) => { e.preventDefault(); showResult(el, recordId, since, extra); });
    if (extra.after) extra.after(r);
    return r;
  }

  return { ACCOUNTS, loadTracker, currentId, watchRecordId, stampSubmitTime, showResult, esc, time };
})();
