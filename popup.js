let targets = { gpt: true, claude: true, gemini: true };
let log = [];

const URLS = {
  gpt:    'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/'
};

// イベント登録（インラインonclickなし）
document.getElementById('pill-gpt').addEventListener('click', () => toggleTarget('gpt'));
document.getElementById('pill-claude').addEventListener('click', () => toggleTarget('claude'));
document.getElementById('pill-gemini').addEventListener('click', () => toggleTarget('gemini'));
document.getElementById('btn-send').addEventListener('click', sendAll);
document.getElementById('btn-clear').addEventListener('click', clearLog);
document.getElementById('btn-dl-all').addEventListener('click', () => downloadLog('all'));
document.getElementById('btn-dl-user').addEventListener('click', () => downloadLog('user'));
document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendAll(); }
});

// ログ読み込み
browser.storage.local.get(['log']).then(r => {
  if (r.log) { log = r.log; renderLog(); }
});

function toggleTarget(name) {
  targets[name] = !targets[name];
  const pill = document.getElementById('pill-' + name);
  const cls = { gpt: 'active-gpt', claude: 'active-c', gemini: 'active-g' }[name];
  pill.classList.toggle(cls, targets[name]);
}

async function sendAll() {
  const text = document.getElementById('msg').value.trim();
  if (!text) return;
  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  setStatus('送信中…', '');
  addLog('user', text);

  const selected = Object.entries(targets).filter(([, v]) => v).map(([k]) => k);
  if (selected.length === 0) {
    setStatus('送信先を1つ以上選んでください', 'err');
    btn.disabled = false;
    return;
  }

  const results = await Promise.allSettled(selected.map(t => sendTo(t, text)));
  const ok   = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const fail = results.length - ok;
  if (fail === 0) {
    setStatus(`✓ ${ok}つのAIに送信しました`, 'ok');
  } else {
    setStatus(`${ok}つ成功 / ${fail}つ失敗（タブが開いているか確認）`, 'err');
  }
  document.getElementById('msg').value = '';
  btn.disabled = false;
}

async function sendTo(target, text) {
  const tabs = await browser.tabs.query({ url: URLS[target] + '*' });
  let tabId;
  if (tabs.length === 0) {
    const tab = await browser.tabs.create({ url: URLS[target] });
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

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + (type || '');
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
}

function addLog(role, text) {
  const ts = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  log.push({ ts, role, text });
  browser.storage.local.set({ log });
  renderLog();
}

function renderLog() {
  const el    = document.getElementById('log-preview');
  const count = document.getElementById('log-count');
  count.textContent = log.filter(l => l.role === 'user').length;
  if (log.length === 0) {
    el.innerHTML = '<span class="empty-log">まだ送信していません</span>';
    return;
  }
  el.innerHTML = log.slice(-20).reverse().map(l => `
    <div class="log-entry">
      <span class="ts">${l.ts}</span>
      <span class="${l.role === 'user' ? 'me' : ''}">${escHtml(l.text.slice(0, 80))}${l.text.length > 80 ? '…' : ''}</span>
    </div>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearLog() {
  if (!confirm('ログをすべて削除しますか？')) return;
  log = [];
  browser.storage.local.set({ log });
  renderLog();
}

function downloadLog(mode) {
  const now = new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');
  let content, filename;
  if (mode === 'user') {
    const lines = log.filter(l => l.role === 'user').map(l => `[${l.ts}]\n${l.text}`).join('\n\n');
    content  = `# 自分の発言ログ (${now})\n\n` + (lines || '（発言なし）');
    filename = `my-messages-${now}.txt`;
  } else {
    const lines = log.map(l => `[${l.ts}] ${l.role === 'user' ? '👤 自分' : '🤖 AI'}\n${l.text}`).join('\n\n---\n\n');
    content  = `# AI Broadcaster 会話ログ (${now})\n\n` + (lines || '（ログなし）');
    filename = `ai-log-${now}.txt`;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
