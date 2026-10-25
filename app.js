/* Sanskrit AI Workspace – client logic.
   Everything is stored only in this browser (localStorage). Nothing is sent anywhere.
   AI replies are NOT connected yet: a local placeholder reply is shown instead. */
'use strict';

// ---------- Service worker (relative path so it works under a sub-folder) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.error);
  });
}

// ---------- Storage ----------
const STORE_KEY = 'sanskritai.v1';
const AI_PLACEHOLDER = 'AI not connected yet. Your message is saved on this device.';

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

function chatPreview(chat) {
  const last = [...chat.messages].reverse().find((m) => m.role === 'user') || chat.messages[chat.messages.length - 1];
  return last ? last.text : 'No messages yet';
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
let currentChatId = null;

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
  $('homeView').hidden = true;
  $('chatView').hidden = false;
  $('chatTitle').textContent = chat.title;
  renderMessages();
  if (location.hash !== '#chat=' + id) history.pushState({ chat: id }, '', '#chat=' + encodeURIComponent(id));
  window.scrollTo(0, document.body.scrollHeight);
}

function closeChat(fromPop) {
  currentChatId = null;
  $('chatView').hidden = true;
  $('homeView').hidden = false;
  renderChats();
  if (!fromPop && location.hash) history.pushState({}, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}

function renderMessages() {
  const chat = state.chats.find((c) => c.id === currentChatId);
  const box = $('messages');
  box.replaceChildren();
  if (!chat) return;
  if (!chat.messages.length) {
    box.append(el('p', 'empty-state', 'Type your first message below. It is saved on this device.'));
  }
  for (const m of chat.messages) {
    const b = el('div', 'bubble ' + (m.role === 'user' ? 'user' : 'ai'));
    if (m.placeholder) b.classList.add('placeholder');
    b.setAttribute('aria-label', (m.role === 'user' ? 'You' : 'Assistant') + ' said');
    b.append(document.createTextNode(m.text));
    b.append(el('span', 'bubble-time', formatDate(m.at)));
    box.append(b);
  }
  updateSendState();
}

function sendMessage(text) {
  const chat = state.chats.find((c) => c.id === currentChatId);
  if (!chat) return;
  const clean = text.replace(/\s+$/, '').replace(/^\s+/, '');
  if (!clean) return;
  const now = Date.now();
  chat.messages.push({ role: 'user', text: clean, at: now });
  // Auto-title a new chat from its first message.
  if (chat.title === 'New chat in Sanskrit' && chat.messages.filter((m) => m.role === 'user').length === 1) {
    chat.title = clean.split('\n')[0].slice(0, 40) + (clean.length > 40 ? '…' : '');
    $('chatTitle').textContent = chat.title;
  }
  // Local placeholder only – no AI service is contacted.
  chat.messages.push({ role: 'ai', text: AI_PLACEHOLDER, at: now + 1, placeholder: true });
  chat.updatedAt = now;
  save();
  renderMessages();
  window.scrollTo(0, document.body.scrollHeight);
}

function updateSendState() {
  $('sendBtn').disabled = !$('messageInput').value.trim();
}

function autoGrow() {
  const ta = $('messageInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
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
    const copyBtn = el('button', 'link-btn', 'Copy');
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', `Copy source: ${s.title}`);
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(s.text); toast('Copied'); } catch (_) { toast('Copy not available here'); }
    });
    const delBtn = el('button', 'link-btn danger', 'Delete');
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', `Delete source: ${s.title}`);
    delBtn.addEventListener('click', () => {
      if (!confirm('Delete this source?')) return;
      state.sources = state.sources.filter((x) => x.id !== s.id);
      save(); renderSources();
    });
    actions.append(copyBtn, delBtn);
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

  $('newChatBtn').addEventListener('click', newChat);
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('searchInput').addEventListener('input', renderChats);

  $('backBtn').addEventListener('click', () => closeChat(false));
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const ta = $('messageInput');
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
      $('composer').requestSubmit();
    }
  });
  $('renameBtn').addEventListener('click', () => {
    const chat = state.chats.find((c) => c.id === currentChatId);
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

  $('shareBtn').addEventListener('click', shareApp);
  $('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) toggleMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
  $('menuInstall').addEventListener('click', () => { toggleMenu(false); doInstall(); });
  $('menuExport').addEventListener('click', () => { toggleMenu(false); exportData(); });
  $('menuAbout').addEventListener('click', () => {
    toggleMenu(false);
    alert('Sanskrit AI Workspace\n\nYour chats and sources are saved only on this device (no account, no tracking).\nAI replies are not connected yet.\nWorks offline after the first visit.');
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
    if (mm) openChat(decodeURIComponent(mm[1])); else if (currentChatId) closeChat(true);
  });
});
