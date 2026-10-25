/* Sanskrit AI Workspace – client logic (v2).
   Chats and sources are stored only in this browser (localStorage).
   If the user saves an OpenAI API key in Settings, chat messages are sent ONLY to
   https://api.openai.com/v1/chat/completions, directly from this browser. Nothing else is sent anywhere. */
'use strict';

// ---------- Service worker (relative path so it works under a sub-folder) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.error);
  });
  // When a new version of the app is installed, reload once so the update shows right away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    // Don't interrupt a reply in progress or a half-typed message; the update then shows next time.
    const input = document.getElementById('messageInput');
    if (busy || (input && input.value.trim())) return;
    reloaded = true;
    window.location.reload();
  });
}

// ---------- Constants ----------
const STORE_KEY = 'sanskritai.v1';
const SETTINGS_KEY = 'sanskritai.settings';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
const HISTORY_LIMIT = 20; // most recent messages sent as context
const AI_PLACEHOLDER = 'AI not connected yet. Your message is saved on this device.';

const SYSTEM_PROMPT = [
  'You are a careful, scholarly assistant for Sanskrit, Telugu and Devanagari texts, helping a Telugu-speaking scholar study ślokas, stotras and śāstra passages.',
  '',
  'Language: Always answer in the language the user writes in. If the user writes in Telugu (తెలుగు), answer in Telugu; if in English, answer in English; if in Sanskrit, answer in Sanskrit unless asked otherwise. Mixed questions may get mixed answers.',
  '',
  'When the user gives a śloka or verse, by default provide:',
  '1. The verse in Devanagari, exactly and correctly (fix only obvious typos and say so).',
  '2. The verse in Telugu script if the user writes in Telugu or asks for it.',
  '3. IAST transliteration (with correct diacritics: ā ī ū ṛ ṝ ḷ ṃ ḥ ś ṣ ṇ ṭ ḍ ñ ṅ).',
  '4. Padaccheda (पदच्छेद / పదచ్ఛేదం): split sandhi and list each word with its grammatical form where useful (vibhakti, vacana, liṅga, dhātu/lakāra) and its meaning.',
  '5. Anvaya (prose order) when helpful.',
  '6. Meaning (bhāvārtha) in Telugu and in English.',
  '7. Brief notes on context, source text and traditional commentary if known; say clearly when you are unsure of a source rather than inventing one.',
  '',
  'Accuracy: Keep Devanagari and Telugu spelling, conjuncts, visarga, anusvāra and avagraha correct. Never invent verses, verse numbers or attributions. If a verse looks corrupted or you are not certain, say so.',
  'Format: Use short headings and lists; keep it readable on a phone. Do not use tables wider than a phone screen.',
  'Follow the user’s explicit instructions (for example only translation, only padaccheda, or a different output order).'
].join('\n');

// ---------- Storage ----------
function sampleData() {
  const d = (s) => new Date(s).getTime();
  return {
    chats: [
      { id: 'c1', title: 'శ్లోక వివరణ 43–47', updatedAt: d('2026-10-14T10:00:00'),
        messages: [{ role: 'user', text: '43–47 శ్లోకాలు...', at: d('2026-10-14T10:00:00') }] },
      { id: 'c2', title: 'శ్లోక అనువాదం', updatedAt: d('2026-10-11T10:00:00'),
        messages: [{ role: 'user', text: 'యస్య ద్విరదవక్త్రాద్యాః పారిషద్యాః పరః శతమ్...', at: d('2026-10-11T10:00:00') }] },
      { id: 'c3', title: 'లక్ష్మీ వివరణ', updatedAt: d('2026-10-10T10:00:00'),
        messages: [{ role: 'user', text: 'Give this whole thread as a word doc...', at: d('2026-10-10T10:00:00') }] }
    ],
    sources: []
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.chats) && Array.isArray(data.sources)) return data;
    }
  } catch (e) { console.warn('Could not read saved data', e); }
  return sampleData();
}

let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save – device storage may be full.'); }
}
save();

// Settings (API key + model) are kept separately, on this device only, and are NOT included in backups.
function getSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { apiKey: typeof s.apiKey === 'string' ? s.apiKey : '', model: (typeof s.model === 'string' && s.model.trim()) || DEFAULT_MODEL };
  } catch (_) { return { apiKey: '', model: DEFAULT_MODEL }; }
}
function setSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: s.apiKey || '', model: s.model || DEFAULT_MODEL })); }
const hasKey = () => !!getSettings().apiKey;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Create an element; text is always set with textContent (never innerHTML) so user text cannot inject HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function btn(className, text, onClick, label) {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}
/** Escape text for the generated Word document (the only place HTML is built as a string). */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Minimal, safe Markdown rendering for AI replies (headings, bullets, **bold**, `code`).
    Builds DOM nodes with textContent only – no HTML from the reply is ever interpreted. */
function appendInline(parent, line) {
  for (const part of line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) parent.append(el('strong', null, part.slice(2, -2)));
    else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) parent.append(el('code', null, part.slice(1, -1)));
    else parent.append(document.createTextNode(part));
  }
}
function renderRich(container, text) {
  container.replaceChildren();
  for (const raw of String(text).split('\n')) {
    let line = raw, cls = 'md-p', m;
    if (!line.trim()) { container.append(el('div', 'md-gap')); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { container.append(el('hr', 'md-hr')); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { line = m[1]; cls = 'md-h'; }
    else if ((m = line.match(/^(\s*)[-*•]\s+(.*)$/))) { line = '• ' + m[2]; cls = m[1].length >= 2 ? 'md-li md-li2' : 'md-li'; }
    else if ((m = line.match(/^(\s*)(\d+[.)])\s+(.*)$/))) { line = m[2] + ' ' + m[3]; cls = 'md-li'; }
    const div = el('div', cls);
    appendInline(div, line);
    container.append(div);
  }
}
/** Plain text for copying (drops Markdown symbols). */
function stripMd(text) {
  return String(text).split('\n').map((l) => l.replace(/^\s*#{1,6}\s+/, '').replace(/^(\s*)[-*]\s+/, '$1• ')).join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1');
}

function formatDate(ts) {
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const opts = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (_) {
    // Fallback for browsers without clipboard permission.
    const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (__) { toast('Copy not available here'); }
    ta.remove();
  }
}

function chatPreview(chat) {
  const last = [...chat.messages].reverse().find((m) => m.role === 'user') || chat.messages[chat.messages.length - 1];
  return last ? last.text : 'No messages yet';
}

// ---------- Views ----------
let currentChatId = null;
let settingsReturnTo = 'home';

function showView(name) {
  $('homeView').hidden = name !== 'home';
  $('chatView').hidden = name !== 'chat';
  $('settingsView').hidden = name !== 'settings';
}

function updateAiNotes() {
  const s = getSettings();
  $('aiNote').textContent = s.apiKey
    ? `AI replies by OpenAI (${s.model}). Messages in this chat are sent to OpenAI. Do not enter patient information.`
    : 'AI replies are not connected yet. Your messages are saved on this device only.';
  $('footerNote').textContent = s.apiKey
    ? 'Chats are saved on this device. AI connected (OpenAI).'
    : 'Everything is saved only on this device. AI replies are not connected yet.';
}

// ---------- Chats list ----------
function renderChats() {
  const container = $('chatList');
  const q = ($('searchInput').value || '').trim().toLowerCase();
  container.replaceChildren();
  const list = [...state.chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)));

  if (!list.length) {
    container.append(el('p', 'empty-state', q ? 'No chats match your search.' : 'No chats yet. Tap “New chat in Sanskrit” to start.'));
    return;
  }
  for (const chat of list) {
    const item = el('button', 'chat-item');
    item.type = 'button';
    item.dataset.id = chat.id;
    item.setAttribute('aria-label', `Open chat: ${chat.title}`);
    const content = el('div', 'chat-content');
    content.append(el('h2', 'chat-title', chat.title), el('p', 'chat-preview', chatPreview(chat)));
    item.append(content, el('span', 'chat-date', formatDate(chat.updatedAt)));
    item.addEventListener('click', () => openChat(chat.id));
    container.append(item);
  }
}

// ---------- Chat view ----------
function newChat() {
  const now = Date.now();
  const chat = { id: uid('c'), title: 'New chat in Sanskrit', updatedAt: now, messages: [] };
  state.chats.push(chat);
  save();
  openChat(chat.id);
  $('messageInput').focus();
}

function openChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  currentChatId = id;
  showView('chat');
  updateAiNotes();
  $('chatTitle').textContent = chat.title;
  renderMessages();
  if (location.hash !== '#chat=' + id) history.pushState({ chat: id }, '', '#chat=' + encodeURIComponent(id));
  window.scrollTo(0, document.body.scrollHeight);
}

function closeChat(fromPop) {
  currentChatId = null;
  showView('home');
  updateAiNotes();
  renderChats();
  if (!fromPop && location.hash) history.pushState({}, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}

const currentChat = () => state.chats.find((c) => c.id === currentChatId);

function renderMessages() {
  const chat = currentChat();
  const box = $('messages');
  box.replaceChildren();
  if (!chat) return;
  if (!chat.messages.length) {
    box.append(el('p', 'empty-state', hasKey()
      ? 'Type a verse or a question below. Example: “Explain this śloka word by word.”'
      : 'Type your first message below. It is saved on this device.'));
  }
  const keySet = hasKey();
  chat.messages.forEach((m, i) => {
    const isUser = m.role === 'user';
    const b = el('div', 'bubble ' + (isUser ? 'user' : 'ai'));
    if (m.placeholder) b.classList.add('placeholder');
    if (m.error) b.classList.add('error');
    b.setAttribute('aria-label', (isUser ? 'You' : 'Assistant') + ' said');
    if (!isUser && !m.placeholder && !m.error) {
      b.classList.add('rich');
      const body = el('div', 'rich-body');
      renderRich(body, m.text);
      b.append(body);
    } else {
      b.append(document.createTextNode(m.text));
    }
    if (!isUser) {
      const actions = el('div', 'bubble-actions');
      if (m.placeholder) {
        if (!keySet) actions.append(btn('bubble-btn strong', 'Connect AI', () => openSettings('chat'), 'Connect AI – open Settings'));
      } else if (m.error) {
        if (i === chat.messages.length - 1) actions.append(btn('bubble-btn strong', 'Try again', () => retryLast(), 'Try again'));
        actions.append(btn('bubble-btn', 'Settings', () => openSettings('chat'), 'Open Settings'));
      } else {
        actions.append(btn('bubble-btn', 'Copy', () => copyText(stripMd(m.text)), 'Copy this reply'));
      }
      if (actions.childNodes.length) b.append(actions);
    }
    b.append(el('span', 'bubble-time', formatDate(m.at) + (m.model ? ' · ' + m.model : '')));
    box.append(b);
  });
  updateSendState();
}

let busy = false;
let abortCtrl = null;

function sendMessage(text) {
  const chat = currentChat();
  if (!chat || busy) return;
  const clean = text.trim();
  if (!clean) return;
  const now = Date.now();
  // Drop a trailing error bubble so the conversation stays clean.
  if (chat.messages.length && chat.messages[chat.messages.length - 1].error) chat.messages.pop();
  chat.messages.push({ role: 'user', text: clean, at: now });
  if (chat.title === 'New chat in Sanskrit' && chat.messages.filter((m) => m.role === 'user').length === 1) {
    chat.title = clean.split('\n')[0].slice(0, 40) + (clean.length > 40 ? '…' : '');
    $('chatTitle').textContent = chat.title;
  }
  chat.updatedAt = now;
  if (!hasKey()) {
    chat.messages.push({ role: 'ai', text: AI_PLACEHOLDER, at: now + 1, placeholder: true });
    save(); renderMessages(); window.scrollTo(0, document.body.scrollHeight);
    return;
  }
  save(); renderMessages();
  askAI(chat);
}

function retryLast() {
  const chat = currentChat();
  if (!chat || busy) return;
  if (chat.messages.length && chat.messages[chat.messages.length - 1].error) chat.messages.pop();
  save(); renderMessages();
  if (!hasKey()) { openSettings('chat'); return; }
  askAI(chat);
}

function buildHistory(chat) {
  return chat.messages
    .filter((m) => !m.placeholder && !m.error && m.text)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

/** Turn an OpenAI / network failure into a plain-language message. */
function friendlyError(status, body, err) {
  const e = (body && body.error) || {};
  const code = e.code || e.type || '';
  const raw = e.message ? ` (OpenAI says: ${String(e.message).slice(0, 200)})` : '';
  if (err && err.name === 'AbortError') return 'Stopped.';
  if (!status) {
    if (!navigator.onLine) return 'You are offline. Connect to the internet and try again.';
    return 'Could not reach OpenAI. Check your internet connection and try again.';
  }
  if (status === 401) return 'Your API key was not accepted. Please check it in Settings (it should start with “sk-”), or create a new key at platform.openai.com.';
  if (status === 429 && /insufficient_quota|billing/i.test(code + ' ' + (e.message || ''))) {
    return 'Your OpenAI account has no credit left or billing is not set up. Add credit at platform.openai.com → Settings → Billing, then try again.';
  }
  if (status === 429) return 'OpenAI is busy or you are sending too fast (rate limit). Please wait a minute and try again.';
  if (status === 404 || code === 'model_not_found') return `The model “${getSettings().model}” is not available to your account. Change the model in Settings (for example gpt-4o or gpt-4o-mini).${raw}`;
  if (status === 403) return `Your API key does not have permission for this request.${raw}`;
  if (status === 400) return `OpenAI could not process this request.${raw}`;
  if (status >= 500) return 'OpenAI is having a problem right now. Please try again in a few minutes.';
  return `Something went wrong (error ${status}).${raw}`;
}

async function readJsonSafe(res) {
  try { return await res.json(); } catch (_) { return null; }
}

async function askAI(chat) {
  const { apiKey, model } = getSettings();
  busy = true; setSendMode('stop');
  const box = $('messages');
  // "Thinking…" bubble, replaced by streamed text as it arrives.
  const live = el('div', 'bubble ai thinking');
  live.setAttribute('aria-label', 'Assistant is replying');
  const liveBody = el('div', 'rich-body');
  const dots = el('span', 'dots', 'Thinking');
  live.append(dots, liveBody);
  const empty = box.querySelector('.empty-state'); if (empty) empty.remove();
  box.append(live);
  window.scrollTo(0, document.body.scrollHeight);

  abortCtrl = new AbortController();
  let text = '';
  let failure = null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...buildHistory(chat)] }),
      signal: abortCtrl.signal
    });
    if (!res.ok) {
      failure = friendlyError(res.status, await readJsonSafe(res));
    } else if ((res.headers.get('content-type') || '').includes('text/event-stream') && res.body && res.body.getReader) {
      // Streaming (Server-Sent Events)
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; break; }
          let json; try { json = JSON.parse(data); } catch (_) { continue; }
          if (json.error) { failure = friendlyError(400, json); done = true; break; }
          const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
          if (delta) {
            if (!text) { dots.remove(); live.classList.remove('thinking'); live.classList.add('rich'); }
            text += delta;
            renderRich(liveBody, text);
            if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 160) window.scrollTo(0, document.body.scrollHeight);
          }
        }
      }
    } else {
      // Non-streaming JSON fallback
      const json = await readJsonSafe(res);
      text = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      if (!text) failure = 'OpenAI returned an empty reply. Please try again.';
    }
  } catch (err) {
    failure = friendlyError(0, null, err);
  }
  busy = false; abortCtrl = null; setSendMode('send');
  const at = Date.now();
  if (text) chat.messages.push({ role: 'ai', text, at, model });
  if (failure && !(failure === 'Stopped.' && text)) chat.messages.push({ role: 'ai', text: failure, at: at + 1, error: true });
  chat.updatedAt = at;
  save();
  if (currentChatId === chat.id) { renderMessages(); window.scrollTo(0, document.body.scrollHeight); }
}

function setSendMode(mode) {
  const b = $('sendBtn');
  if (mode === 'stop') { b.textContent = '■'; b.classList.add('stop'); b.setAttribute('aria-label', 'Stop reply'); b.disabled = false; }
  else { b.textContent = '↑'; b.classList.remove('stop'); b.setAttribute('aria-label', 'Send message'); updateSendState(); }
}
function updateSendState() { if (!busy) $('sendBtn').disabled = !$('messageInput').value.trim(); }

function autoGrow() {
  const ta = $('messageInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

// ---------- Word document export ----------
function wordBody(m) {
  if (m.role === 'user' || m.error) return escapeHtml(m.text).replace(/\n/g, '<br>');
  return String(m.text).split('\n').map((l) => {
    let h = false;
    const mm = l.match(/^\s*#{1,6}\s+(.*)$/);
    if (mm) { l = mm[1]; h = true; }
    l = l.replace(/^(\s*)[-*]\s+/, '$1• ');
    let out = escapeHtml(l).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '$1');
    return h ? '<b>' + out + '</b>' : out;
  }).join('<br>');
}

function downloadChatAsWord() {
  const chat = currentChat();
  if (!chat) return;
  const fontStack = "'Noto Sans Telugu', 'Noto Sans Devanagari', 'Nirmala UI', 'Gautami', 'Mangal', 'Kohinoor Telugu', 'Kohinoor Devanagari', Arial, sans-serif";
  const rows = chat.messages.filter((m) => !m.placeholder).map((m) => {
    const who = m.role === 'user' ? 'You' : (m.error ? 'Note' : 'AI');
    const when = new Date(m.at).toLocaleString();
    return `<p class="who">${escapeHtml(who)} <span class="when">· ${escapeHtml(when)}</span></p>` +
      `<p class="msg">${wordBody(m)}</p>`;
  }).join('\n');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${escapeHtml(chat.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body { font-family: ${fontStack}; font-size: 12pt; line-height: 1.6; }
h1 { font-family: ${fontStack}; font-size: 18pt; margin-bottom: 4pt; }
.meta { color: #666666; font-size: 9pt; margin-bottom: 16pt; }
.who { font-weight: bold; margin: 14pt 0 2pt 0; font-size: 10pt; color: #333333; }
.when { font-weight: normal; color: #888888; }
.msg { margin: 0 0 6pt 0; font-family: ${fontStack}; }
</style></head>
<body>
<h1>${escapeHtml(chat.title)}</h1>
<p class="meta">Sanskrit AI Workspace · exported ${escapeHtml(new Date().toLocaleString())}</p>
${rows || '<p>(No messages yet)</p>'}
</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const safe = chat.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'chat';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '.doc';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Word document downloaded');
}

// ---------- Settings ----------
function openSettings(returnTo) {
  settingsReturnTo = returnTo || (currentChatId ? 'chat' : 'home');
  const s = getSettings();
  $('apiKeyInput').value = s.apiKey;
  $('apiKeyInput').type = 'password';
  $('toggleKeyBtn').textContent = 'Show';
  $('toggleKeyBtn').setAttribute('aria-pressed', 'false');
  $('modelInput').value = s.model;
  $('testResult').textContent = '';
  $('testResult').className = 'test-result';
  updateKeyStatus();
  showView('settings');
  window.scrollTo(0, 0);
  $('settingsTitle').focus();
}

function closeSettings() {
  if (settingsReturnTo === 'chat' && currentChatId) { showView('chat'); updateAiNotes(); renderMessages(); }
  else { showView('home'); updateAiNotes(); renderChats(); }
}

function updateKeyStatus() {
  const s = getSettings();
  $('keyStatus').textContent = s.apiKey ? `Key saved on this device (ends in …${s.apiKey.slice(-4)}).` : 'No key saved.';
  $('removeKeyBtn').hidden = !s.apiKey;
}

function saveSettingsFromForm() {
  const apiKey = $('apiKeyInput').value.trim();
  const model = $('modelInput').value.trim() || DEFAULT_MODEL;
  $('modelInput').value = model;
  setSettings({ apiKey, model });
  updateKeyStatus();
  updateAiNotes();
  return { apiKey, model };
}

function showTestResult(ok, msg) {
  const r = $('testResult');
  r.textContent = msg;
  r.className = 'test-result ' + (ok ? 'ok' : 'err');
}

async function testConnection() {
  const { apiKey, model } = saveSettingsFromForm();
  if (!apiKey) { showTestResult(false, 'Please paste your API key first.'); return; }
  const tb = $('testBtn');
  tb.disabled = true; tb.textContent = 'Testing…';
  showTestResult(true, '');
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: OK' }], max_completion_tokens: 16 })
    });
    if (res.ok) showTestResult(true, `✓ Connected. OpenAI replied using ${model}. You can now chat.`);
    else showTestResult(false, friendlyError(res.status, await readJsonSafe(res)));
  } catch (err) {
    showTestResult(false, friendlyError(0, null, err));
  }
  tb.disabled = false; tb.textContent = 'Test connection';
}

// ---------- Sources ----------
function renderSources() {
  const box = $('sourceList');
  box.replaceChildren();
  if (!state.sources.length) {
    box.append(el('p', 'empty-state', 'No sources yet. Paste a verse, passage, or note above to keep it here.'));
    return;
  }
  for (const s of [...state.sources].sort((a, b) => b.at - a.at)) {
    const item = el('article', 'source-item');
    const head = el('div', 'source-head');
    head.append(el('h3', 'source-title', s.title), el('span', 'chat-date', formatDate(s.at)));
    const actions = el('div', 'source-actions');
    actions.append(
      btn('link-btn', 'Copy', () => copyText(s.text), `Copy source: ${s.title}`),
      btn('link-btn danger', 'Delete', () => {
        if (!confirm('Delete this source?')) return;
        state.sources = state.sources.filter((x) => x.id !== s.id);
        save(); renderSources();
      }, `Delete source: ${s.title}`)
    );
    item.append(head, el('p', 'source-text', s.text), actions);
    box.append(item);
  }
}

// ---------- Tabs ----------
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('chatsPanel').hidden = name !== 'chats';
  $('sourcesPanel').hidden = name !== 'sources';
  if (name === 'sources') renderSources(); else renderChats();
}

// ---------- Install hint ----------
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hintDismissed = () => localStorage.getItem('sanskritai.hintDismissed') === '1';

function showInstallHint() {
  if (isStandalone() || hintDismissed()) return;
  if (deferredPrompt) {
    $('installText').textContent = 'Install this app for quick, offline access.';
    $('installBtn').hidden = false;
    $('installHint').hidden = false;
  } else if (isIOS()) {
    $('installText').textContent = 'To install on iPhone/iPad: tap Share, then “Add to Home Screen”.';
    $('installBtn').hidden = true;
    $('installHint').hidden = false;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallHint();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  $('installHint').hidden = true;
  toast('App installed');
});

async function doInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null;
    $('installHint').hidden = true;
  } else if (isStandalone()) {
    toast('The app is already installed.');
  } else if (isIOS()) {
    toast('In Safari: tap Share, then “Add to Home Screen”.');
  } else {
    toast('Use your browser menu: “Install app” or the install icon in the address bar.');
  }
}

// ---------- Menu ----------
function toggleMenu(open) {
  const panel = $('menuPanel');
  const willOpen = open !== undefined ? open : panel.hidden;
  panel.hidden = !willOpen;
  $('menuBtn').setAttribute('aria-expanded', String(willOpen));
}

function exportData() {
  // The API key is deliberately NOT included in the backup.
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sanskrit-ai-backup.json';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function shareApp() {
  const url = new URL('./', location.href).href;
  if (navigator.share) {
    try { await navigator.share({ title: 'Sanskrit AI Workspace', url }); } catch (_) {}
  } else {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (_) { toast(url); }
  }
}

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  renderChats();
  renderSources();
  updateAiNotes();

  $('newChatBtn').addEventListener('click', newChat);
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('searchInput').addEventListener('input', renderChats);

  $('backBtn').addEventListener('click', () => { if (abortCtrl) abortCtrl.abort(); closeChat(false); });
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { if (abortCtrl) abortCtrl.abort(); return; }
    const ta = $('messageInput');
    if (!ta.value.trim()) return;
    sendMessage(ta.value);
    ta.value = '';
    autoGrow(); updateSendState();
    ta.focus();
  });
  $('messageInput').addEventListener('input', () => { autoGrow(); updateSendState(); });
  $('messageInput').addEventListener('keydown', (e) => {
    // Enter sends on desktop; Shift+Enter makes a new line. (On phones the keyboard's return key adds a line.)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      if (!busy) $('composer').requestSubmit();
    }
  });
  $('downloadDocBtn').addEventListener('click', downloadChatAsWord);
  $('renameBtn').addEventListener('click', () => {
    const chat = currentChat();
    if (!chat) return;
    const name = prompt('Chat name', chat.title);
    if (name && name.trim()) { chat.title = name.trim().slice(0, 120); save(); $('chatTitle').textContent = chat.title; }
  });
  $('deleteChatBtn').addEventListener('click', () => {
    if (!confirm('Delete this chat? This cannot be undone.')) return;
    state.chats = state.chats.filter((c) => c.id !== currentChatId);
    save(); closeChat(false);
  });

  $('sourceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('sourceTitle').value.trim();
    const text = $('sourceText').value.trim();
    if (!title || !text) return;
    state.sources.push({ id: uid('s'), title: title.slice(0, 200), text, at: Date.now() });
    save();
    $('sourceForm').reset();
    renderSources();
    toast('Source saved on this device');
  });

  // Settings
  $('settingsBackBtn').addEventListener('click', closeSettings);
  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { apiKey } = saveSettingsFromForm();
    showTestResult(true, apiKey ? 'Saved. Tap “Test connection” to check it.' : 'Saved (no key – AI stays off).');
  });
  $('testBtn').addEventListener('click', testConnection);
  $('removeKeyBtn').addEventListener('click', () => {
    if (!confirm('Remove the API key from this device?')) return;
    setSettings({ apiKey: '', model: $('modelInput').value.trim() || DEFAULT_MODEL });
    $('apiKeyInput').value = '';
    updateKeyStatus(); updateAiNotes();
    showTestResult(true, 'Key removed from this device. AI replies are now off.');
  });
  $('toggleKeyBtn').addEventListener('click', () => {
    const inp = $('apiKeyInput');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('toggleKeyBtn').textContent = show ? 'Hide' : 'Show';
    $('toggleKeyBtn').setAttribute('aria-pressed', String(show));
    $('toggleKeyBtn').setAttribute('aria-label', show ? 'Hide key' : 'Show key');
  });

  $('shareBtn').addEventListener('click', shareApp);
  $('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) toggleMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
  $('menuSettings').addEventListener('click', () => { toggleMenu(false); openSettings('home'); });
  $('menuInstall').addEventListener('click', () => { toggleMenu(false); doInstall(); });
  $('menuExport').addEventListener('click', () => { toggleMenu(false); exportData(); });
  $('menuAbout').addEventListener('click', () => {
    toggleMenu(false);
    alert('Sanskrit AI Workspace\n\nYour chats and sources are saved only on this device (no account, no tracking).\n' +
      (hasKey() ? 'AI replies come from OpenAI using your own API key. Messages you send in a chat go to OpenAI only.\n' : 'AI replies are not connected yet (add your OpenAI API key in Settings).\n') +
      'Works offline after the first visit (AI replies need internet).');
  });
  $('menuReset').addEventListener('click', () => {
    toggleMenu(false);
    if (!confirm('Replace all chats and sources on this device with the sample data?')) return;
    state = sampleData(); save(); closeChat(false); switchTab('chats'); toast('Reset to sample data');
  });

  $('installBtn').addEventListener('click', doInstall);
  $('installClose').addEventListener('click', () => {
    localStorage.setItem('sanskritai.hintDismissed', '1');
    $('installHint').hidden = true;
  });
  showInstallHint();

  // Open a chat directly from the URL (#chat=id), and support the browser Back button.
  const m = location.hash.match(/^#chat=(.+)$/);
  if (m) openChat(decodeURIComponent(m[1]));
  window.addEventListener('popstate', () => {
    const mm = location.hash.match(/^#chat=(.+)$/);
    if (mm) openChat(decodeURIComponent(mm[1])); else if (currentChatId || !$('settingsView').hidden) closeChat(true);
  });
});
