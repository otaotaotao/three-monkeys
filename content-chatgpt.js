// Content script for ChatGPT
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'AI_BROADCAST') return;
  insertAndSend(msg.text).then(ok => sendResponse({ ok })).catch(e => {
    console.error('[AI Broadcaster] ChatGPT error:', e);
    sendResponse({ ok: false });
  });
  return true;
});

async function insertAndSend(text) {
  const selectors = [
    '#prompt-textarea',
    'div[contenteditable="true"]',
    'textarea'
  ];

  let input = null;
  for (const sel of selectors) {
    input = document.querySelector(sel);
    if (input) { console.log('[AI Broadcaster] ChatGPT: found input with', sel); break; }
  }
  if (!input) { console.warn('[AI Broadcaster] ChatGPT: input not found'); return false; }

  input.click();
  input.focus();
  await wait(100);

  if (input.tagName === 'TEXTAREA') {
    // textarea: nativeのsetterを使う
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    setter.set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable: clipboard経由
    const range = document.createRange();
    range.selectNodeContents(input);
    const sel2 = window.getSelection();
    sel2.removeAllRanges();
    sel2.addRange(range);
    await wait(50);
    try {
      await navigator.clipboard.writeText(text);
      document.execCommand('paste');
    } catch (e) {
      input.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: text, bubbles: true, cancelable: true
      }));
    }
  }

  await wait(400);

  const sendSelectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="メッセージを送信"]',
  ];
  for (const sel of sendSelectors) {
    const btn = document.querySelector(sel);
    if (btn && !btn.disabled) { btn.click(); return true; }
  }

  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
  }));
  return true;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
