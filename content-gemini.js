// Content script for Gemini (Firefox)
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'AI_BROADCAST') return;
  handleBroadcast(msg.text).then(ok => sendResponse({ ok })).catch(e => {
    console.error('[AI Broadcaster] Gemini error:', e);
    sendResponse({ ok: false });
  });
  return true;
});

async function handleBroadcast(text) {
  // Previously this reloaded the whole page when Gemini was mid-response.
  // Simplified: just wait (no reload) until Gemini looks idle, then proceed.
  await waitUntilIdle(15000);
  return insertAndSend(text);
}

function isThinking() {
  const indicators = [
    '.loading-indicator',
    '[data-test-id="loading"]',
    'model-response.loading',
    '.response-container.loading',
    'model-thoughts',
  ];
  for (const sel of indicators) {
    if (document.querySelector(sel)) return true;
  }
  // Stop ボタンが visible かつ enabled なら thinking 中
  const stopBtn = document.querySelector(
    'button[aria-label="Stop response"], button[aria-label="停止"]'
  );
  if (stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null) return true;
  return false;
}

async function waitUntilIdle(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!isThinking()) return true;
    await wait(400);
  }
  console.warn('[AI Broadcaster] Gemini: still busy after timeout, proceeding anyway');
  return false;
}

function findInput() {
  const selectors = [
    '.ql-editor[contenteditable="true"]',
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function insertAndSend(text) {
  let input = null;
  for (let i = 0; i < 10; i++) {
    input = findInput();
    if (input) break;
    await wait(300);
  }
  if (!input) { console.warn('[AI Broadcaster] Gemini: input not found'); return false; }

  input.click();
  input.focus();
  await wait(200);

  // 既存テキストをAngularに認識させながらクリア
  if (input.tagName !== 'TEXTAREA') {
    // Ctrl+A → Delete でAngularのイベントを通してクリア
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
    await wait(50);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true }));
    await wait(100);
    // 念のりinnerHTMLもクリア
    input.innerHTML = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(100);
  } else {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    setter.set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // テキスト挿入
  if (input.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    setter.set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    try {
      await navigator.clipboard.writeText(text);
      document.execCommand('paste');
      console.log('[AI Broadcaster] Gemini: pasted via clipboard');
    } catch (e) {
      console.warn('[AI Broadcaster] Gemini: clipboard failed, using beforeinput');
      input.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: text, bubbles: true, cancelable: true
      }));
    }
  }

  await wait(600);

  const inputText = input.tagName === 'TEXTAREA' ? input.value : input.innerText;
  console.log('[AI Broadcaster] Gemini: input content:', JSON.stringify(inputText.slice(0, 50)));

  // Angularが送信ボタンをenabledにするまで最大2秒待つ
  let sendBtn = null;
  const sendSelectors = [
    'button[aria-label="プロンプトを送信"]',
    'button[aria-label="Send message"]',
    'button[aria-label="送信"]',
    'button.send-button',
    'button[mattooltip="Send message"]',
    'button[mattooltip="送信"]',
    '[data-test-id="send-button"]',
  ];
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const sel of sendSelectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) {
        sendBtn = btn;
        break;
      }
    }
    if (sendBtn) break;
    await wait(400);
  }
  if (sendBtn) {
    console.log('[AI Broadcaster] Gemini: clicking send button');
    sendBtn.click();
    return true;
  }

  console.warn('[AI Broadcaster] Gemini: no send button, trying Enter');
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
  }));
  return true;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
