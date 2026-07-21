let targets = { gpt: true, claude: true, gemini: true, perplexity: true };
let monkeyTargets = { gpt: false, claude: false, gemini: false, perplexity: false };
let monkeyTexts = { gpt: '', claude: '', gemini: '', perplexity: '' };
let mode = 'broadcast';
let logBroadcast = [];
let logMonkeys = [];
let statsWindow = { mode: 'count', n: 6 }; // ambient reflection window for the Stats tab (broadcast log only)
let sessionStart = null;   // ms — when the current unbroken session began
let lastActivityAt = null; // ms — last broadcast send, used to detect downtime
const SESSION_GAP_MS = 60 * 60 * 1000; // >1hr since the last send starts a new session
let chartMetric = 'avg'; // 'avg' | 'median' | 'ema' — which trend line the ambient chart draws
const CHART_PERIOD = 6;  // rolling window / EMA period, in sends

const URLS = {
  gpt:        'https://chatgpt.com/',
  claude:     'https://claude.ai/',
  gemini:     'https://gemini.google.com/',
  perplexity: 'https://www.perplexity.ai/'
};

const NEW_CHAT_URLS = {
  gpt:        'https://chatgpt.com/g/g-67edab4a24fc8191b975acaa8da2dcef-monday',
  claude:     'https://claude.ai/new',
  gemini:     'https://gemini.google.com/app',
  perplexity: 'https://www.perplexity.ai/'
};

const LABELS = { gpt: 'Monday', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity' };
const ORDER = ['gpt', 'claude', 'gemini', 'perplexity'];
const TARGET_CLASS = { gpt: 'active-gpt', claude: 'active-c', gemini: 'active-g', perplexity: 'active-p' };

// Rate limit for the 3 Monkeys "Send Combined" action only —
// this loop is the one that can spiral into an endless AI-vs-AI-vs-AI cycle.
const MONKEY_RATE_LIMIT = 5;               // max combined-sends
const MONKEY_RATE_WINDOW_MS = 60 * 60 * 1000; // per rolling hour
let monkeySendTimestamps = [];

// ===== Mode tabs =====
document.getElementById('tab-broadcast').addEventListener('click', () => setMode('broadcast'));
document.getElementById('tab-monkeys').addEventListener('click', () => setMode('monkeys'));
document.getElementById('tab-stats').addEventListener('click', () => setMode('stats'));

function setMode(m) {
  mode = m;
  document.getElementById('tab-broadcast').classList.toggle('active', m === 'broadcast');
  document.getElementById('tab-monkeys').classList.toggle('active', m === 'monkeys');
  document.getElementById('tab-stats').classList.toggle('active', m === 'stats');
  document.getElementById('view-broadcast').classList.toggle('hidden', m !== 'broadcast');
  document.getElementById('view-monkeys').classList.toggle('hidden', m !== 'monkeys');
  document.getElementById('view-stats').classList.toggle('hidden', m !== 'stats');
  document.getElementById('new-chat-bar').classList.toggle('hidden', m === 'stats');
  browser.storage.local.set({ mode });
  renderLog();
  if (m === 'stats') renderStats();
}

// ===== Broadcast target pills =====
ORDER.forEach(name => {
  document.getElementById('pill-' + name).addEventListener('click', () => toggleTarget(name));
});
document.getElementById('btn-send').addEventListener('click', sendAll);
document.getElementById('btn-clear').addEventListener('click', clearLog);
document.getElementById('btn-dl-user').addEventListener('click', downloadLog);
document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendAll(); }
});
document.getElementById('msg').addEventListener('input', debounce(e => {
  browser.storage.local.set({ draftBroadcast: e.target.value });
}, 300));
document.getElementById('msg').addEventListener('input', e => {
  document.getElementById('msg-char-count').textContent = e.target.value.length;
});

// ===== New chat buttons =====
ORDER.forEach(name => {
  document.getElementById('new-' + name).addEventListener('click', () => newChat(name));
});
document.getElementById('new-all').addEventListener('click', () => {
  ORDER.forEach(t => newChat(t));
});

// ===== 3 Monkeys view wiring =====
ORDER.forEach(key => {
  document.getElementById('mk-' + key).addEventListener('input', debounce(e => {
    monkeyTexts[key] = e.target.value;
    browser.storage.local.set({ monkeyTexts });
  }, 300));
  document.getElementById('mk-' + key).addEventListener('input', e => {
    document.getElementById('mk-' + key + '-char-count').textContent = e.target.value.length;
  });
  document.getElementById('mk-pill-' + key).addEventListener('click', () => toggleMonkeyTarget(key));
});
document.getElementById('btn-send-monkeys').addEventListener('click', sendMonkeys);

// ===== Stats view wiring =====
document.getElementById('stats-slider').addEventListener('input', e => {
  statsWindow = { mode: 'count', n: Number(e.target.value) };
  browser.storage.local.set({ statsWindow });
  renderStats();
});
document.getElementById('stats-today-btn').addEventListener('click', () => {
  statsWindow = { mode: statsWindow.mode === 'today' ? 'count' : 'today', n: statsWindow.n || 6 };
  browser.storage.local.set({ statsWindow });
  renderStats();
});

document.querySelectorAll('.chart-metric-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    chartMetric = btn.dataset.metric;
    document.querySelectorAll('.chart-metric-btn').forEach(b => b.classList.toggle('active', b === btn));
    browser.storage.local.set({ chartMetric });
    renderStats();
  });
});

// ===== Restore state =====
browser.storage.local.get([
  'logBroadcast', 'logMonkeys', 'targets', 'draftBroadcast',
  'monkeyTexts', 'monkeyTargets', 'mode', 'monkeySendTimestamps', 'statsWindow',
  'sessionStart', 'lastActivityAt', 'chartMetric'
]).then(r => {
  if (r.logBroadcast) logBroadcast = r.logBroadcast;
  if (r.logMonkeys) logMonkeys = r.logMonkeys;
  if (r.chartMetric) {
    chartMetric = r.chartMetric;
    document.querySelectorAll('.chart-metric-btn').forEach(b => b.classList.toggle('active', b.dataset.metric === chartMetric));
  }
  if (r.monkeySendTimestamps) monkeySendTimestamps = r.monkeySendTimestamps;
  if (r.statsWindow) statsWindow = r.statsWindow;
  if (r.sessionStart) sessionStart = r.sessionStart;
  if (r.lastActivityAt) lastActivityAt = r.lastActivityAt;
  renderAmbientHint();

  if (r.targets) {
    targets = r.targets;
    ORDER.forEach(name => {
      const pill = document.getElementById('pill-' + name);
      const cls = TARGET_CLASS[name];
      pill.classList.toggle(cls, !!targets[name]);
    });
  }

  if (r.draftBroadcast !== undefined) {
    document.getElementById('msg').value = r.draftBroadcast;
  } else {
    document.getElementById('msg').value = '';
  }
  document.getElementById('msg-char-count').textContent = document.getElementById('msg').value.length;

  if (r.monkeyTexts) {
    monkeyTexts = r.monkeyTexts;
  }
  ORDER.forEach(key => {
    const val = monkeyTexts[key] || '';
    document.getElementById('mk-' + key).value = val;
    document.getElementById('mk-' + key + '-char-count').textContent = val.length;
  });

  if (r.monkeyTargets) {
    monkeyTargets = r.monkeyTargets;
    ORDER.forEach(name => renderMonkeyPill(name));
  }

  if (r.mode) setMode(r.mode);
  renderLog();
});

// ===== Broadcast logic =====
function toggleTarget(name) {
  targets[name] = !targets[name];
  const pill = document.getElementById('pill-' + name);
  const cls = TARGET_CLASS[name];
  pill.classList.toggle(cls, targets[name]);
  browser.storage.local.set({ targets });
}

async function sendAll() {
  const text = document.getElementById('msg').value.trim();
  if (!text) return;
  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  setStatus('status', 'Sending...', '');
  addLog('broadcast', text);

  // Clear immediately — if opening a missing tab steals focus and the
  // popup closes mid-send, we don't want the old text to survive.
  document.getElementById('msg').value = '';
  document.getElementById('msg-char-count').textContent = '0';
  browser.storage.local.set({ draftBroadcast: '' });

  const selected = ORDER.filter(k => targets[k]);
  if (selected.length === 0) {
    setStatus('status', 'Select at least one destination', 'err');
    btn.disabled = false;
    return;
  }

  const results = await Promise.allSettled(selected.map(t => sendTo(t, text)));
  const ok   = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const fail = results.length - ok;
  if (fail === 0) {
    setStatus('status', `✓ Sent to ${ok} AI(s)`, 'ok');
  } else {
    setStatus('status', `${ok} sent / ${fail} failed (check if tab is open)`, 'err');
  }
  btn.disabled = false;
}

// ===== 3 Monkeys logic =====
function toggleMonkeyTarget(name) {
  monkeyTargets[name] = !monkeyTargets[name];
  renderMonkeyPill(name);
  browser.storage.local.set({ monkeyTargets });
}

function renderMonkeyPill(name) {
  const pill = document.getElementById('mk-pill-' + name);
  const cls = TARGET_CLASS[name];
  pill.classList.toggle(cls, !!monkeyTargets[name]);
}

function buildCombinedMessage() {
  return ORDER
    .map(key => ({ key, text: (document.getElementById('mk-' + key).value || '').trim() }))
    .filter(({ text }) => text.length > 0)
    .map(({ key, text }) => `${LABELS[key]}: ${text}`)
    .join('\n\n---\n\n');
}

async function sendMonkeys() {
  const combined = buildCombinedMessage();
  if (!combined) return;

  const selected = ORDER.filter(k => monkeyTargets[k]);
  if (selected.length === 0) {
    setStatus('status-monkeys', 'Select at least one destination', 'err');
    return;
  }

  pruneMonkeyTimestamps();
  if (monkeySendTimestamps.length >= MONKEY_RATE_LIMIT) {
    const resetInMs = monkeySendTimestamps[0] + MONKEY_RATE_WINDOW_MS - Date.now();
    const resetInMin = Math.max(1, Math.ceil(resetInMs / 60000));
    setStatus('status-monkeys', `Rate limit reached (${MONKEY_RATE_LIMIT}/hour) — resets in ~${resetInMin} min`, 'err');
    return;
  }

  const btn = document.getElementById('btn-send-monkeys');
  btn.disabled = true;
  setStatus('status-monkeys', 'Sending...', '');
  addLog('monkeys', combined, selected.map(k => LABELS[k]).join(', '));

  // Clear immediately, before awaiting the sends (see sendAll for why).
  ORDER.forEach(key => {
    document.getElementById('mk-' + key).value = '';
    document.getElementById('mk-' + key + '-char-count').textContent = '0';
    monkeyTexts[key] = '';
  });
  browser.storage.local.set({ monkeyTexts });

  const results = await Promise.allSettled(selected.map(t => sendTo(t, combined)));
  const ok   = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const fail = results.length - ok;

  monkeySendTimestamps.push(Date.now());
  browser.storage.local.set({ monkeySendTimestamps });
  pruneMonkeyTimestamps();
  const used = monkeySendTimestamps.length;

  if (fail === 0) {
    setStatus('status-monkeys', `✓ Sent to ${ok} destination(s) · ${used}/${MONKEY_RATE_LIMIT} this hour`, 'ok');
  } else {
    setStatus('status-monkeys', `${ok} sent / ${fail} failed · ${used}/${MONKEY_RATE_LIMIT} this hour`, 'err');
  }

  btn.disabled = false;
}

function pruneMonkeyTimestamps() {
  const cutoff = Date.now() - MONKEY_RATE_WINDOW_MS;
  monkeySendTimestamps = monkeySendTimestamps.filter(t => t > cutoff);
}

// ===== Shared send / new-chat =====
async function sendTo(target, text) {
  const tabs = await browser.tabs.query({ url: URLS[target] + '*' });
  let tabId;
  if (tabs.length === 0) {
    const tab = await browser.tabs.create({ url: URLS[target], active: false });
    tabId = tab.id;
    await wait(3500);
  } else {
    tabId = tabs[0].id;
  }
  try {
    const resp = await browser.tabs.sendMessage(tabId, { type: 'AI_BROADCAST', target, text });
    return resp && resp.ok === true;
  } catch (e) {
    console.error('[AI Broadcaster] sendMessage failed for', target, e);
    return false;
  }
}

async function newChat(target) {
  const base = NEW_CHAT_URLS[target];
  const url = base + (base.includes('?') ? '&' : '?') + '_t=' + Date.now();
  const tabs = await browser.tabs.query({ url: URLS[target] + '*' });
  if (tabs.length > 0) {
    await browser.tabs.update(tabs[0].id, { url });
  } else {
    await browser.tabs.create({ url });
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ===== Status / log (mode-aware: broadcast and monkeys logs are independent) =====
function setStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.className = 'status ' + (type || '');
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
}

function activeLog() {
  return mode === 'monkeys' ? logMonkeys : logBroadcast;
}

function addLog(scope, text, meta) {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const entry = { ts, tsFull: now.getTime(), role: 'user', text, meta };
  if (scope === 'monkeys') {
    logMonkeys.push(entry);
    // cap to last 1000 entries so storage doesn't grow unbounded
    if (logMonkeys.length > 1000) logMonkeys = logMonkeys.slice(-1000);
    browser.storage.local.set({ logMonkeys });
  } else {
    logBroadcast.push(entry);
    if (logBroadcast.length > 1000) logBroadcast = logBroadcast.slice(-1000);
    browser.storage.local.set({ logBroadcast });
    touchSession(now.getTime());
    renderAmbientHint();
  }
  renderLog();
}

function renderLog() {
  const log = activeLog();
  const el    = document.getElementById('log-preview');
  const count = document.getElementById('log-count');
  count.textContent = log.length;
  if (log.length === 0) {
    el.innerHTML = '<span class="empty-log">No messages yet</span>';
    return;
  }
  el.innerHTML = log.slice(-20).reverse().map(l => `
    <div class="log-entry">
      <span class="ts">${l.ts}${l.meta ? ' → ' + escHtml(l.meta) : ''}</span>
      <span class="me">${escHtml(l.text.slice(0, 80))}${l.text.length > 80 ? '…' : ''}</span>
    </div>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearLog() {
  const label = mode === 'monkeys' ? '3 Monkeys' : 'Broadcast';
  if (!confirm(`Clear ${label} log?`)) return;
  if (mode === 'monkeys') {
    logMonkeys = [];
    browser.storage.local.set({ logMonkeys });
  } else {
    logBroadcast = [];
    browser.storage.local.set({ logBroadcast });
    renderAmbientHint();
  }
  renderLog();
}

async function downloadLog() {
  const log = activeLog();
  const label = mode === 'monkeys' ? 'monkeys' : 'broadcast';
  const statusId = mode === 'monkeys' ? 'status-monkeys' : 'status';
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}_${mm}${dd}`;
  const filename = `${dateStr}_${label}.txt`;

  const DIVIDER = '─'.repeat(16);
  let content = '';
  let lastDateKey = null;

  log.forEach(l => {
    const d = new Date(l.tsFull || Date.now());
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dateKey !== lastDateKey) {
      if (lastDateKey !== null) content += '\n';
      const weekday = d.toLocaleDateString('ja-JP', { weekday: 'short' });
      content += `${dateKey}(${weekday}) ${DIVIDER}\n`;
      lastDateKey = dateKey;
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    content += `${l.text}${l.meta ? ' → ' + l.meta : ''}\n[${hh}:${mi}]\n\n`;
  });
  if (!content) content = '(no messages)';

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  if (!browser.downloads) {
    setStatus(statusId, 'Export failed: "downloads" permission not active — reload the extension in about:debugging', 'err');
    URL.revokeObjectURL(url);
    return;
  }

  try {
    // saveAs:false — no dialog each time. This lands in Firefox's configured
    // default download folder. Point that folder at 書類/three-monkeys once
    // in about:preferences (General → Downloads → Save files to) and every
    // export will land there automatically from now on.
    await browser.downloads.download({ url, filename, saveAs: false });
    setStatus(statusId, `✓ Exported ${filename}`, 'ok');

    // Clear the log now that it's safely on disk.
    if (mode === 'monkeys') {
      logMonkeys = [];
      browser.storage.local.set({ logMonkeys });
    } else {
      logBroadcast = [];
      browser.storage.local.set({ logBroadcast });
      renderAmbientHint();
    }
    renderLog();
  } catch (e) {
    console.error('[AI Broadcaster] download failed', e);
    setStatus(statusId, `Export failed: ${e.message || e}`, 'err');
  }
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ===== Stats (ambient reflection, not a limiter — broadcast log only) =====
function gapColor(gapMs) {
  if (gapMs == null) return '#55555f';
  const minutes = Math.max(0.5, Math.min(240, gapMs / 60000));
  const t = 1 - (Math.log(minutes) - Math.log(0.5)) / (Math.log(240) - Math.log(0.5)); // 1 = rapid, 0 = calm
  const hue = 220 - t * 200; // 220 blue (calm) → 20 warm (rapid)
  return `hsl(${hue}, 55%, 58%)`;
}

function fmtHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Downtime since the last send decides whether this is a continuing session
// (sessionStart stays put) or a fresh one (sessionStart resets to now).
function touchSession(ts) {
  if (lastActivityAt == null || (ts - lastActivityAt) > SESSION_GAP_MS) {
    sessionStart = ts;
  }
  lastActivityAt = ts;
  browser.storage.local.set({ sessionStart, lastActivityAt });
}

function gapAgo(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'moments apart';
  if (min < 60) return `${min}分ぶり`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}時間ぶり`;
  return `${Math.round(hr / 24)}日ぶり`;
}

function latestEntryInfo() {
  if (logBroadcast.length === 0) return null;
  const last = logBroadcast[logBroadcast.length - 1];
  const prev = logBroadcast.length > 1 ? logBroadcast[logBroadcast.length - 2] : null;
  const gapMs = prev ? last.tsFull - prev.tsFull : null;
  return {
    text: `${last.text.length} chars · ${gapMs == null ? 'first of the session' : gapAgo(gapMs)}`,
    color: gapColor(gapMs)
  };
}

function renderAmbientHint() {
  const el = document.getElementById('ambient-hint');
  if (!el) return;
  const info = latestEntryInfo();
  const sessionPrefix = (info && sessionStart != null) ? `Session since ${fmtHHMM(sessionStart)} · ` : '';
  el.textContent = info ? sessionPrefix + info.text : '';
  el.style.color = info ? info.color : '';
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function variance(arr, avg) { return mean(arr.map(v => (v - avg) ** 2)); }
function stdDev(arr, avg) { return arr.length > 1 ? Math.sqrt(variance(arr, avg)) : NaN; }

// Rolling avg/median over a trailing window, one output value per input point.
function rollingSeries(arr, period, kind) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - period + 1), i + 1);
    return kind === 'median' ? median(slice) : mean(slice);
  });
}

function emaSeries(arr, period) {
  const alpha = 2 / (period + 1);
  let prev = null;
  return arr.map(v => { prev = prev == null ? v : v * alpha + prev * (1 - alpha); return prev; });
}

// A single neutral glyph for "is this higher/lower/about the same as usual" —
// no red/green, no up-is-good framing. Within 25% of scale counts as "same".
function trendSymbol(diff, scale) {
  if (!isFinite(diff)) return '';
  if (!isFinite(scale) || scale === 0) return Math.abs(diff) < 1e-9 ? '●' : (diff > 0 ? '▲' : '▽');
  const ratio = diff / scale;
  if (Math.abs(ratio) < 0.25) return '●';
  return ratio > 0 ? '▲' : '▽';
}

function fmt(n, dec) { return isFinite(n) ? n.toFixed(dec) : '—'; }
function fmtSigned(n, dec) { return isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(dec)}` : '—'; }

function hourKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`; }
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

function bucketCounts(entries, keyFn) {
  const counts = {};
  entries.forEach(e => { const k = keyFn(e.tsFull); counts[k] = (counts[k] || 0) + 1; });
  return Object.values(counts);
}

function gapsOf(entries) {
  const gaps = [];
  for (let i = 1; i < entries.length; i++) gaps.push((entries[i].tsFull - entries[i - 1].tsFull) / 60000);
  return gaps;
}

// One row: baseline (avg/median/sd) from `baselineArr`, "now" compared against
// the baseline average, and the sd itself compared against a shorter recent
// slice (`recentArr`) to say whether things have gotten more or less scattered.
function metricRow(baselineArr, nowValue, recentArr) {
  if (baselineArr.length === 0) return null;
  const avg = mean(baselineArr);
  const med = median(baselineArr);
  const sd = stdDev(baselineArr, avg);
  const diffNow = isFinite(nowValue) ? nowValue - avg : NaN;
  const diffSymbol = trendSymbol(diffNow, isFinite(sd) && sd > 0 ? sd : Math.abs(avg) * 0.2 || 1);
  let sdSymbol = '';
  if (recentArr && recentArr.length > 1 && isFinite(sd)) {
    const recentSd = stdDev(recentArr, mean(recentArr));
    sdSymbol = trendSymbol(recentSd - sd, sd || 1);
  }
  return { avg, med, sd, diffNow, diffSymbol, sdSymbol };
}

function statsWindowEntries() {
  if (statsWindow.mode === 'today') {
    const now = new Date();
    return logBroadcast.filter(e => {
      const t = new Date(e.tsFull || 0);
      return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
    });
  }
  return logBroadcast.slice(-statsWindow.n);
}

function renderStats() {
  const latestEl = document.getElementById('stats-latest');
  const windowLabelEl = document.getElementById('stats-window-label');
  const tableEl = document.getElementById('stats-table');
  const svg = document.getElementById('stats-ambient');

  const latest = latestEntryInfo();
  latestEl.textContent = latest ? latest.text : 'No sends yet';
  latestEl.style.color = latest ? latest.color : '';

  document.getElementById('stats-slider').value = statsWindow.n || 6;
  document.getElementById('stats-today-btn').classList.toggle('active', statsWindow.mode === 'today');

  const entries = statsWindowEntries();

  if (logBroadcast.length === 0) {
    windowLabelEl.textContent = statsWindow.mode === 'today' ? 'Today · no sends yet' : `Last ${statsWindow.n} · no sends yet`;
    tableEl.innerHTML = '';
    svg.innerHTML = '';
    return;
  }

  windowLabelEl.textContent = statsWindow.mode === 'today'
    ? `Today · ${entries.length} sends`
    : `Last ${entries.length} sends`;

  renderStatsTable(tableEl, entries);
  renderAmbientSvg(svg, entries.length ? entries : logBroadcast.slice(-12));
}

// Baseline (avg/median/sd) is always all-time — a stable self-reference.
// "Now" and the recent-window slice (governed by the slider/Today toggle)
// are what move around it.
function renderStatsTable(tableEl, windowEntries) {
  const now = Date.now();
  const last = logBroadcast[logBroadcast.length - 1];

  const allLens = logBroadcast.map(e => e.text.length);
  const recentLens = windowEntries.map(e => e.text.length);
  const charsRow = metricRow(allLens, last.text.length, recentLens);

  const allGaps = gapsOf(logBroadcast);
  const recentGaps = gapsOf(windowEntries);
  const liveSilence = (now - last.tsFull) / 60000;
  const silenceRow = metricRow(allGaps, liveSilence, recentGaps);

  const hourCounts = bucketCounts(logBroadcast, hourKey);
  const nowHourCount = logBroadcast.filter(e => hourKey(e.tsFull) === hourKey(now)).length;
  const recentHourCounts = bucketCounts(windowEntries, hourKey);
  const hourRow = metricRow(hourCounts, nowHourCount, recentHourCounts);

  const dayCounts = bucketCounts(logBroadcast, dayKey);
  const nowDayCount = logBroadcast.filter(e => dayKey(e.tsFull) === dayKey(now)).length;
  const recentDayCounts = bucketCounts(windowEntries, dayKey);
  const dayRow = metricRow(dayCounts, nowDayCount, recentDayCounts);

  const rows = [
    { label: 'Chars / send', row: charsRow, dec: 0 },
    { label: 'Sends / hour', row: hourRow, dec: 1 },
    { label: 'Sends / day', row: dayRow, dec: 1 },
    { label: 'Silence (min)', row: silenceRow, dec: 0 }
  ];

  tableEl.innerHTML = `
    <table class="stats-table">
      <thead><tr><th></th><th>Avg</th><th>Now Δ</th><th>Median</th><th>SD</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="stats-row-label">${r.label}</td>
            ${r.row ? `
              <td>${fmt(r.row.avg, r.dec)}</td>
              <td>${fmtSigned(r.row.diffNow, r.dec)} <span class="trend">${r.row.diffSymbol}</span></td>
              <td>${fmt(r.row.med, r.dec)}</td>
              <td>${fmt(r.row.sd, r.dec)} <span class="trend">${r.row.sdSymbol}</span></td>
            ` : `<td colspan="4">—</td>`}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAmbientSvg(svg, entries) {
  const shown = entries.slice(-12);
  if (shown.length === 0) { svg.innerHTML = ''; return; }
  const offset = entries.length - shown.length; // entries before `shown` start, for gap-to-previous on the first dot

  // The smoothed line is computed over the *full* history so it has real
  // trailing context, then we read off just the values lined up with `shown`.
  const allLens = logBroadcast.map(e => e.text.length);
  const smoothAll = chartMetric === 'median' ? rollingSeries(allLens, CHART_PERIOD, 'median')
    : chartMetric === 'ema' ? emaSeries(allLens, CHART_PERIOD)
    : rollingSeries(allLens, CHART_PERIOD, 'avg');
  const sd = stdDev(allLens, mean(allLens));
  const band = isFinite(sd) ? sd : 0;

  const shownIdx = shown.map(e => logBroadcast.indexOf(e));
  const smoothVals = shownIdx.map(i => smoothAll[i]);

  // x maps to real elapsed time (not index), so bursts cluster and quiet
  // stretches leave visible empty space — frequency/timing at a glance.
  const w = 440, hFull = 72, padX = 16, padTop = 10, padBottom = 20;
  const h = hFull - padTop - padBottom;
  const minTs = shown[0].tsFull;
  const maxTs = shown[shown.length - 1].tsFull;
  const tsSpan = Math.max(maxTs - minTs, 1);
  const xOf = ts => shown.length > 1 ? padX + (w - padX * 2) * (ts - minTs) / tsSpan : w / 2;

  const rawLens = shown.map(e => e.text.length);
  const maxLen = Math.max(...rawLens, ...smoothVals.map(v => v + band), 1);
  const minLen = Math.min(...rawLens, ...smoothVals.map(v => v - band), 0);
  const range = Math.max(maxLen - minLen, 1);
  const yOf = v => padTop + h * (1 - (v - minLen) / range);

  const points = shown.map((e, i) => {
    const cx = xOf(e.tsFull);
    const cy = yOf(e.text.length);
    const r = 3 + Math.sqrt(e.text.length / Math.max(...rawLens, 1)) * 8;
    const prev = i > 0 ? shown[i - 1] : (offset > 0 ? entries[offset - 1] : null);
    const gapMs = prev ? e.tsFull - prev.tsFull : null;
    return { cx, cy, r, color: gapColor(gapMs) };
  });

  const smoothPoints = shown.map((e, i) => ({ cx: xOf(e.tsFull), cy: yOf(smoothVals[i]) }));
  const smoothLine = smoothPoints.map(p => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const bandTop = shown.map((e, i) => `${xOf(e.tsFull).toFixed(1)},${yOf(smoothVals[i] + band).toFixed(1)}`);
  const bandBottom = shown.map((e, i) => `${xOf(e.tsFull).toFixed(1)},${yOf(smoothVals[i] - band).toFixed(1)}`).reverse();
  const bandPath = `${bandTop.join(' ')} ${bandBottom.join(' ')}`;

  const circles = points.map(p =>
    `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.color}" fill-opacity="0.5" stroke="${p.color}" stroke-opacity="0.8" />`
  ).join('');

  const bandSvg = smoothPoints.length > 1 && band > 0
    ? `<polygon points="${bandPath}" fill="#4a9eff" fill-opacity="0.08" />` : '';
  const lineSvg = smoothPoints.length > 1
    ? `<polyline points="${smoothLine}" fill="none" stroke="#8a8a95" stroke-width="1.5" />` : '';
  const timeLabels = shown.length > 1
    ? `<text x="${padX}" y="${hFull - 4}" font-size="8" fill="#55555f" font-family="monospace">${fmtHHMM(minTs)}</text>
       <text x="${w - padX}" y="${hFull - 4}" font-size="8" fill="#55555f" font-family="monospace" text-anchor="end">${fmtHHMM(maxTs)}</text>`
    : '';

  svg.innerHTML = `${bandSvg}${lineSvg}${circles}${timeLabels}`;
}
