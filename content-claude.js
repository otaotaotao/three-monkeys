// Content script for Claude.ai
window.__aiBroadcasterLoaded = true;
console.log('[AI Broadcaster] content-claude.js LOADED on', location.href);

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'AI_BROADCAST') return;
  insertAndSend(msg.text).then(ok => sendResponse({ ok })).catch(e => {
    console.error('[AI Broadcaster] Claude error:', e);
    sendResponse({ ok: false });
  });
  return true;
});

async function insertAndSend(text) {
  const input = document.querySelector('div.tiptap.ProseMirror');
  if (!input) {
    console.warn('[AI Broadcaster] Claude: input not found');
    return false;
  }
  console.log('[AI Broadcaster] Claude: input found!');

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
    console.log('[AI Broadcaster] Claude: pasted via clipboard');
  } catch (e) {
    console.warn('[AI Broadcaster] Claude: clipboard failed:', e);
    input.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: text, bubbles: true, cancelable: true
    }));
  }

  await wait(500);

  const btn = document.querySelector('button[aria-label="メッセージを送信"]')
           || document.querySelector('button[aria-label="Send message"]');
  if (btn && !btn.disabled) {
    console.log('[AI Broadcaster] Claude: clicking send button');
    btn.click();
    return true;
  }

  console.warn('[AI Broadcaster] Claude: no send button, trying Enter');
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
  }));
  return true;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
