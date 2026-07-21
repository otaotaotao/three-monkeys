// Content script for Perplexity
window.__aiBroadcasterLoaded = true;
console.log('[AI Broadcaster] content-perplexity.js LOADED on', location.href);

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'AI_BROADCAST') return;
  insertAndSend(msg.text).then(ok => sendResponse({ ok })).catch(e => {
    console.error('[AI Broadcaster] Perplexity error:', e);
    sendResponse({ ok: false });
  });
  return true;
});

function findInput() {
  return document.getElementById('ask-input')
      || document.querySelector('div[contenteditable="true"]');
}

async function insertAndSend(text) {
  let input = null;
  for (let i = 0; i < 10; i++) {
    input = findInput();
    if (input) break;
    await wait(300);
  }
  if (!input) { console.warn('[AI Broadcaster] Perplexity: input not found'); return false; }

  input.click();
  input.focus();
  await wait(100);

  const range = document.createRange();
  range.selectNodeContents(input);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  await wait(50);

  try {
    await navigator.clipboard.writeText(text);
    document.execCommand('paste');
    console.log('[AI Broadcaster] Perplexity: pasted via clipboard');
  } catch (e) {
    console.warn('[AI Broadcaster] Perplexity: clipboard failed, trying execCommand/beforeinput:', e);
    if (!document.execCommand('insertText', false, text)) {
      input.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: text, bubbles: true, cancelable: true
      }));
    }
  }

  await wait(500);

  const sendSelectors = [
    'button[aria-label="送信"]',
    'button[aria-label="Submit"]'
  ];
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const sel2 of sendSelectors) {
      const btn = document.querySelector(sel2);
      if (btn && !btn.disabled) {
        console.log('[AI Broadcaster] Perplexity: clicking send button');
        btn.click();
        return true;
      }
    }
    await wait(300);
  }

  console.warn('[AI Broadcaster] Perplexity: no send button, trying Enter');
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
  }));
  return true;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
