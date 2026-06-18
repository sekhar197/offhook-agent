/* offhook dashboard — dependency-free vanilla SPA.
   Reads the call records + config the agent already produces (local only). */

const token = new URLSearchParams(location.search).get('t') || '';
const view = document.getElementById('view');
const nav = document.getElementById('nav');

const NAV = [
  ['calls', 'Calls'], ['phone', 'Phone'], ['scorecard', 'Scorecard'],
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

const CFG_INPUT_STYLE = 'width:100%;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px';
const CFG_FIELDS = [
  ['agent.agentName', 'Agent name', 'text'],
  ['agent.greeting', 'Greeting', 'text'],
  ['agent.tone', 'Tone', 'select'],
  ['agent.instructions', 'Instructions', 'area'],
  ['tools.transferPhone', 'Transfer phone', 'text'],
  ['voice.endpointingMaxDelayMs', 'Endpointing max (ms)', 'number'],
  ['voice.allowInterruptions', 'Allow barge-in', 'bool'],
];

async function panelConfig() {
  const c = await api('/api/config');
  const ed = c.editable || {};
  const val = (p) => { const v = ed[p]; return v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v)); };
  const inputFor = ([p, label, type]) => {
    let input;
    if (type === 'select') input = `<select data-path="${p}" style="${CFG_INPUT_STYLE}">${['warm', 'formal', 'casual'].map(t => `<option ${ed[p] === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    else if (type === 'bool') input = `<input type="checkbox" data-path="${p}" ${ed[p] ? 'checked' : ''}>`;
    else if (type === 'area') input = `<textarea data-path="${p}" rows="3" style="${CFG_INPUT_STYLE}">${esc(val(p))}</textarea>`;
    else input = `<input type="${type}" data-path="${p}" value="${esc(val(p))}" style="${CFG_INPUT_STYLE}">`;
    return `<div class="k">${label}</div><div>${input}</div>`;
  };
  view.innerHTML = `<h1>Config</h1>
    <div class="card"><div class="kv">${CFG_FIELDS.map(inputFor).join('')}</div>
      <div style="margin-top:14px"><button class="primary" id="cfg-save">Save</button> <span id="cfg-status" class="muted"></span></div>
    </div>
    <div class="card muted" style="font-size:12px">Edits are validated against the schema and a timestamped backup is written before any change. The model + the brain's prompt are not editable here.</div>`;
  document.getElementById('cfg-save').onclick = saveConfig;
}

async function saveConfig() {
  const status = document.getElementById('cfg-status');
  const edits = [];
  for (const el of view.querySelectorAll('[data-path]')) {
    const path = el.getAttribute('data-path');
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else {
      const raw = el.value;
      if (raw === '') continue; // skip empties — don't write blank optional fields
      try { value = JSON.parse(raw); } catch { value = raw; }
    }
    edits.push({ path, value });
  }
  status.textContent = 'saving…'; status.className = 'muted';
  try {
    const r = await fetch('/api/config', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ edits }) });
    const j = await r.json();
    status.textContent = j.ok ? `✓ saved · backup ${j.backupPath}` : `✗ ${j.error}`;
    status.className = j.ok ? 'pass' : 'block';
  } catch (e) { status.textContent = `✗ ${e.message}`; status.className = 'block'; }
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

// ---- phone panel (provision / connect / release) ----------------------------

async function panelPhone() {
  const s = await api('/api/phone/status');
  const provisioned = !!s.phoneNumber;
  const connected = !!s.livekitDispatchRuleId;
  const statusHtml = connected ? '<span class="pass">live — answering calls</span>'
    : provisioned ? '<span class="muted">provisioned, not connected</span>'
      : '<span class="muted">not set up</span>';
  view.innerHTML = `<h1>Phone</h1>
    <div class="card"><div class="kv">
      <div class="k">Number</div><div>${provisioned ? esc(s.phoneNumber) : '<span class="muted">none yet</span>'}</div>
      <div class="k">Provider</div><div>${esc(s.provider || '—')}</div>
      <div class="k">Status</div><div>${statusHtml}</div>
    </div></div>
    <div class="card">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <span class="muted">Provider</span>
        <select id="ph-provider" style="${CFG_INPUT_STYLE};width:120px"><option>twilio</option><option>telnyx</option></select>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input id="ph-area" placeholder="area code (optional)" style="${CFG_INPUT_STYLE};width:150px">
        <button class="primary" id="ph-provision">Provision new</button>
        <button class="ghost" id="ph-connect">Connect (go live)</button>
        <button class="ghost" id="ph-release">Release</button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <input id="ph-existing" placeholder="bring existing +1…" style="${CFG_INPUT_STYLE};width:200px">
        <button class="ghost" id="ph-use">Use existing number</button>
      </div>
      <div id="ph-status" class="muted" style="margin-top:10px"></div>
    </div>
    <div class="card muted" style="font-size:12px">Provision buys a real number via Twilio (needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + LIVEKIT_SIP_URI). Connect creates the LiveKit trunk + dispatch. Then run the worker: <code>offhook start</code>.</div>`;
  const st = document.getElementById('ph-status');
  const act = async (path, body) => {
    st.textContent = 'working…'; st.className = 'muted';
    try {
      const r = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const j = await r.json();
      st.textContent = j.ok ? '✓ done' : `✗ ${j.error}`;
      st.className = j.ok ? 'pass' : 'block';
      if (j.ok) setTimeout(panelPhone, 700);
    } catch (e) { st.textContent = `✗ ${e.message}`; st.className = 'block'; }
  };
  const provider = () => document.getElementById('ph-provider').value;
  document.getElementById('ph-provision').onclick = () => act('/api/phone/provision', { provider: provider(), areaCode: document.getElementById('ph-area').value || undefined });
  document.getElementById('ph-use').onclick = () => act('/api/phone/use', { provider: provider(), number: document.getElementById('ph-existing').value });
  document.getElementById('ph-connect').onclick = () => act('/api/phone/connect');
  document.getElementById('ph-release').onclick = () => { if (confirm('Release the number + trunks? This is irreversible.')) act('/api/phone/release'); };
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
    if (page === 'phone') return await panelPhone();
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
