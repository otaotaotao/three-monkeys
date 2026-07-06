let targets = { gpt: true, claude: true, gemini: true };
let monkeyTargets = { gpt: false, claude: false, gemini: false };
let monkeyTexts = { gpt: '', claude: '', gemini: '' };
let mode = 'broadcast';
let logBroadcast = [];
let logMonkeys = [];

const URLS = {
  gpt:    'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/'
};

const NEW_CHAT_URLS = {
  gpt:    'https://chatgpt.com/',
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app'
};

const LABELS = { gpt: 'Monday', claude: 'Claude', gemini: 'Gemini' };
const ORDER = ['gpt', 'claude', 'gemini'];

// Rate limit for the 3 Monkeys "Send Combined" action only —
// this loop is the one that can spiral into an endless AI-vs-AI-vs-AI cycle.
const MONKEY_RATE_LIMIT = 5;               // max combined-sends
const MONKEY_RATE_WINDOW_MS = 60 * 60 * 1000; // per rolling hour
let monkeySendTimestamps = [];

// ===== Mode tabs =====
document.getElementById('tab-broadcast').addEventListener('click', () => setMode('broadcast'));
document.getElementById('tab-monkeys').addEventListener('click', () => setMode('monkeys'));

function setMode(m) {
  mode = m;
  document.getElementById('tab-broadcast').classList.toggle('active', m === 'broadcast');
  document.getElementById('tab-monkeys').classList.toggle('active', m === 'monkeys');
  document.getElementById('view-broadcast').classList.toggle('hidden', m !== 'broadcast');
  document.getElementById('view-monkeys').classList.toggle('hidden', m !== 'monkeys');
  browser.storage.local.set({ mode });
  renderLog();
}

// ===== Broadcast target pills =====
document.getElementById('pill-gpt').addEventListener('click', () => toggleTarget('gpt'));
document.getElementById('pill-claude').addEventListener('click', () => toggleTarget('claude'));
document.getElementById('pill-gemini').addEventListener('click', () => toggleTarget('gemini'));
document.getElementById('btn-send').addEventListener('click', sendAll);
document.getElementById('btn-clear').addEventListener('click', clearLog);
document.getElementById('btn-dl-user').addEventListener('click', downloadLog);
document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendAll(); }
});
document.getElementById('msg').addEventListener('input', debounce(e => {
  browser.storage.local.set({ draftBroadcast: e.target.value });
}, 300));

// ===== New chat buttons =====
document.getElementById('new-gpt').addEventListener('click', () => newChat('gpt'));
document.getElementById('new-claude').addEventListener('click', () => newChat('claude'));
document.getElementById('new-gemini').addEventListener('click', () => newChat('gemini'));
document.getElementById('new-all').addEventListener('click', () => {
  ORDER.forEach(t => newChat(t));
});

// ===== 3 Monkeys view wiring =====
ORDER.forEach(key => {
  document.getElementById('mk-' + key).addEventListener('input', debounce(e => {
    monkeyTexts[key] = e.target.value;
    browser.storage.local.set({ monkeyTexts });
  }, 300));
  document.getElementById('mk-pill-' + key).addEventListener('click', () => toggleMonkeyTarget(key));
});
document.getElementById('btn-send-monkeys').addEventListener('click', sendMonkeys);

// ===== Restore state =====
browser.storage.local.get([
  'logBroadcast', 'logMonkeys', 'targets', 'draftBroadcast',
  'monkeyTexts', 'monkeyTargets', 'mode', 'monkeySendTimestamps'
]).then(r => {
  if (r.logBroadcast) logBroadcast = r.logBroadcast;
  if (r.logMonkeys) logMonkeys = r.logMonkeys;
  if (r.monkeySendTimestamps) monkeySendTimestamps = r.monkeySendTimestamps;

  if (r.targets) {
    targets = r.targets;
    ORDER.forEach(name => {
      const pill = document.getElementById('pill-' + name);
      const cls = { gpt: 'active-gpt', claude: 'active-c', gemini: 'active-g' }[name];
      pill.classList.toggle(cls, !!targets[name]);
    });
  }

  if (r.draftBroadcast !== undefined) {
    document.getElementById('msg').value = r.draftBroadcast;
  } else {
    document.getElementById('msg').value = '';
  }

  if (r.monkeyTexts) {
    monkeyTexts = r.monkeyTexts;
  }
  ORDER.forEach(key => {
    document.getElementById('mk-' + key).value = monkeyTexts[key] || '';
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
  const cls = { gpt: 'active-gpt', claude: 'active-c', gemini: 'active-g' }[name];
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
  const cls = { gpt: 'active-gpt', claude: 'active-c', gemini: 'active-g' }[name];
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
  const ts = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
      content += `${dateKey} ${DIVIDER}\n`;
      lastDateKey = dateKey;
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    content += `[${hh}:${mi}]${l.meta ? ' → ' + l.meta : ''}\n${l.text}\n\n`;
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
    }
    renderLog();
  } catch (e) {
    console.error('[AI Broadcaster] download failed', e);
    setStatus(statusId, `Export failed: ${e.message || e}`, 'err');
  }
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
