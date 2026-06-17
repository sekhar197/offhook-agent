/* offhook dashboard — dependency-free vanilla SPA.
   Reads the call records + config the agent already produces (local only). */

const token = new URLSearchParams(location.search).get('t') || '';
const view = document.getElementById('view');
const nav = document.getElementById('nav');

const NAV = [
  ['calls', 'Calls'], ['scorecard', 'Scorecard'],
  ['config', 'Config'], ['keys', 'Keys'], ['improve', 'Improve'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (r) => `${Math.round((r ?? 0) * 100)}%`;

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function renderNav(active) {
  nav.innerHTML = NAV.map(([id, label]) =>
    `<button class="${id === active ? 'active' : ''}" onclick="location.hash='#/${id}'">${label}</button>`).join('');
}

// ---- panels -----------------------------------------------------------------

async function panelCalls() {
  const calls = await api('/api/calls?limit=100');
  if (!calls.length) { view.innerHTML = `<h1>Calls</h1><div class="empty">No calls yet. Run <code>offhook start</code> and answer a call.</div>`; return; }
  const rows = calls.map(c => `
    <tr class="row" onclick="location.hash='#/call/${encodeURIComponent(c.callId)}'">
      <td>${esc(new Date(c.startedAt).toLocaleString())}</td>
      <td><span class="badge ${esc(c.outcome)}">${esc(c.outcome)}</span></td>
      <td>${c.turnCount}</td>
      <td>${c.toolCallCount}</td>
      <td>${c.meanTurnMs != null ? c.meanTurnMs + ' ms' : '—'}</td>
    </tr>`).join('');
  view.innerHTML = `<h1>Calls <span class="muted">(${calls.length})</span></h1>
    <div class="card"><table>
      <thead><tr><th>When</th><th>Outcome</th><th>Turns</th><th>Tools</th><th>Mean latency</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

async function panelCall(id) {
  const c = await api(`/api/calls/${encodeURIComponent(id)}`);
  const turns = c.turns.map(t => {
    const parts = [];
    if (t.caller) parts.push(`<div class="turn"><div class="who">caller</div>${esc(t.caller)}</div>`);
    if (t.agent) parts.push(`<div class="turn"><div class="who agent">agent</div>${esc(t.agent)}${t.toolsCalled?.length ? `<div class="tools">tools: ${esc(t.toolsCalled.join(', '))}</div>` : ''}</div>`);
    return parts.join('');
  }).join('');
  const lat = c.latency ? `mean ${c.latency.meanTurnMs}ms · p95 ${c.latency.p95TurnMs}ms · max ${c.latency.maxTurnMs}ms` : 'not measured';
  view.innerHTML = `<h1><a href="#/calls">← Calls</a> · ${esc(c.callId)}</h1>
    <div class="card"><div class="kv">
      <div class="k">Outcome</div><div><span class="badge ${esc(c.outcome)}">${esc(c.outcome)}</span></div>
      <div class="k">Turns</div><div>${c.turnCount}</div>
      <div class="k">Latency</div><div>${lat}</div>
      ${c.errors?.length ? `<div class="k">Errors</div><div class="block">${esc(c.errors.map(e => e.message).join('; '))}</div>` : ''}
    </div></div>
    <div class="card">${turns || '<div class="empty">No transcript.</div>'}</div>`;
}

async function panelScorecard() {
  const s = await api('/api/scorecard');
  if (!s.available) { view.innerHTML = `<h1>Scorecard</h1><div class="empty">No scorecard yet. Run <code>offhook improve</code> or the Improve panel.</div>`; return; }
  const sc = s.scorecard;
  const dims = Object.entries(sc.byDimension || {}).map(([d, v]) =>
    `<tr><td>${esc(d)}</td><td><span class="bar"><i style="width:${pct(v.rate)}"></i></span> ${pct(v.rate)}</td><td>${v.pass}/${v.total}</td></tr>`).join('');
  const fails = (sc.failures || []).map(f => `<li><b>${esc(f.personaId)} / ${esc(f.dimension)}</b>: ${esc(f.note)}</li>`).join('');
  view.innerHTML = `<h1>Scorecard <span class="muted">· overall ${pct(sc.overallPassRate)}</span></h1>
    <div class="card"><table><thead><tr><th>Dimension</th><th>Pass rate</th><th>Passed</th></tr></thead><tbody>${dims}</tbody></table></div>
    <div class="card"><div class="muted" style="margin-bottom:8px">Failures</div>${fails ? `<ul>${fails}</ul>` : '<div class="muted">None — all checks passed.</div>'}</div>`;
}

async function panelConfig() {
  const c = await api('/api/config');
  view.innerHTML = `<h1>Config</h1><div class="card"><div class="kv">
    <div class="k">Agent</div><div>${esc(c.agent.agentName || '—')} at ${esc(c.agent.businessName)} <span class="muted">(${esc(c.agent.tone)})</span></div>
    <div class="k">Tools</div><div>${esc(c.tools.enabled.join(', '))}</div>
    <div class="k">Delivery</div><div>${esc(c.tools.delivery)}</div>
    <div class="k">Pronunciation aliases</div><div>${c.aliasCount}</div>
    <div class="k">Observability</div><div>${esc(c.observability.sink)} → ${esc(c.observability.path)}</div>
    <div class="k">Voice mode</div><div>${esc(c.voiceMode)}</div>
  </div></div>`;
}

async function panelKeys() {
  const keys = await api('/api/keys-status');
  const rows = keys.map(k => `<tr>
    <td><span class="dot ${k.set ? 'on' : 'off'}"></span>${esc(k.envVar)}</td>
    <td>${k.set ? 'SET' : '<span class="muted">missing</span>'}${k.optional ? ' <span class="muted">(optional)</span>' : ''}</td>
    <td class="muted">${esc(k.purpose)}</td></tr>`).join('');
  view.innerHTML = `<h1>Keys</h1><div class="card muted" style="margin-bottom:10px">Shows whether each key is set in this machine's environment. Values are never read or displayed.</div>
    <div class="card"><table><thead><tr><th>Env var</th><th>Status</th><th>Purpose</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---- improve panel (POST + SSE stream) --------------------------------------

let improving = false;
function panelImprove() {
  view.innerHTML = `<h1>Improve <span class="muted">· safety-gated self-improvement</span></h1>
    <div class="card">
      <p class="muted">Reads your real calls, proposes a config fix, and (gated) applies it only if it passes the full eval — including the safety personas. Needs your LLM key set.</p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="primary" id="imp-run">Run (gated, dry-run)</button>
        <label class="muted"><input type="checkbox" id="imp-apply"> apply if the gate passes</label>
        <label class="muted"><input type="checkbox" id="imp-unguarded"> unguarded (no gate)</label>
      </div>
    </div>
    <div class="card" id="imp-log"><div class="muted">Idle.</div></div>`;
  document.getElementById('imp-run').onclick = runImprove;
}

async function runImprove() {
  if (improving) return;
  const apply = document.getElementById('imp-apply').checked;
  const unguarded = document.getElementById('imp-unguarded').checked;
  if (unguarded && !confirm('Unguarded mode applies edits with NO safety gate. This can regress safety. Continue?')) return;
  improving = true;
  const log = document.getElementById('imp-log');
  const line = (html) => { log.innerHTML += `<div>${html}</div>`; };
  log.innerHTML = '';
  try {
    const r = await fetch('/api/improve', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: unguarded ? 'unguarded' : 'gated', apply }),
    });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop();
      for (const p of parts) {
        const m = p.match(/^data: (.*)$/m);
        if (m) handleImproveEvent(JSON.parse(m[1]), line);
      }
    }
  } catch (e) {
    line(`<span class="block">error: ${esc(e.message)}</span>`);
  } finally { improving = false; }
}

function handleImproveEvent(ev, line) {
  if (ev.stage && ev.stage !== 'decided') { line(`<span class="muted">…${esc(ev.stage)}</span>`); return; }
  if (ev.stage === 'decided') {
    const r = ev.result;
    if (r.patch?.rationale) line(`<div style="margin-top:8px"><b>Proposed:</b> ${esc(r.patch.rationale)}</div>`);
    if (r.patch?.edits?.instructions) line(`<pre>${esc(r.patch.edits.instructions)}</pre>`);
    if (r.gate) {
      const cls = r.gate.apply ? 'pass' : 'block';
      const verdict = r.gate.apply ? '✅ PASS' : `⛔ BLOCK — ${esc(r.gate.blockedReason)}`;
      line(`<div class="${cls}"><b>Gate:</b> ${verdict} <span class="muted">(overall ${pct(r.gate.baseline.overallPassRate)} → ${pct(r.gate.candidate.overallPassRate)})</span></div>`);
    }
    line(`<div style="margin-top:6px">${r.applied ? `<span class="pass">✅ ${esc(r.reason)}</span>` : esc(r.reason)}</div>`);
  }
}

// ---- router -----------------------------------------------------------------

async function route() {
  const hash = location.hash || '#/calls';
  const [, page, arg] = hash.split('/');
  renderNav(page || 'calls');
  view.innerHTML = '<div class="empty">Loading…</div>';
  try {
    if (page === 'call' && arg) return await panelCall(arg);
    if (page === 'scorecard') return await panelScorecard();
    if (page === 'config') return await panelConfig();
    if (page === 'keys') return await panelKeys();
    if (page === 'improve') return panelImprove();
    return await panelCalls();
  } catch (e) {
    view.innerHTML = `<div class="empty block">Couldn't load: ${esc(e.message)}.<br>Is the dashboard token in the URL?</div>`;
  }
}

window.addEventListener('hashchange', route);
route();
