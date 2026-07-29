'use strict';

/**
 * Settings window logic. Talks to the main process only through the narrow
 * `window.braindotSettings` bridge in preload-settings.js.
 */

const $ = (id) => document.getElementById(id);

const els = {
  key: $('key'),
  keyStatus: $('keyStatus'),
  clearKey: $('clearKey'),
  model: $('model'),
  convex: $('convex'),
  configPath: $('configPath'),
  reveal: $('reveal'),
  logs: $('logs'),
  cancel: $('cancel'),
  save: $('save'),
  message: $('message'),
};

/** Set when the user hits "remove" — an empty field otherwise means "unchanged". */
let clearingKey = false;

function setMessage(text, kind = '') {
  els.message.textContent = text;
  els.message.className = kind;
}

function renderKeyStatus(state) {
  const chip = els.keyStatus;
  const label = chip.lastElementChild;

  if (clearingKey) {
    chip.className = 'status-chip warn';
    label.textContent = 'will be removed';
    return;
  }
  if (state.isMock) {
    chip.className = 'status-chip warn';
    label.textContent = 'mock mode';
    return;
  }
  if (state.set) {
    chip.className = 'status-chip ok';
    label.textContent = state.hint;
    return;
  }
  chip.className = 'status-chip';
  label.textContent = 'unset';
}

async function load() {
  const cfg = await window.braindotSettings.load();
  const keyState = cfg.OPENAI_API_KEY || { set: false, isMock: false, hint: '' };

  renderKeyStatus(keyState);
  els.key.placeholder = keyState.set ? 'unchanged' : 'sk-…';
  els.model.value = cfg.OPENAI_MODEL || '';
  els.convex.value = cfg.NEXT_PUBLIC_CONVEX_URL || 'not configured';
  els.configPath.textContent = cfg.configPath || '—';
}

async function save() {
  els.save.disabled = true;
  setMessage('saving…');

  const patch = { OPENAI_MODEL: els.model.value.trim() };

  const typed = els.key.value.trim();
  if (clearingKey) patch.OPENAI_API_KEY = '';
  else if (typed) patch.OPENAI_API_KEY = typed;

  try {
    await window.braindotSettings.save(patch);
    setMessage('restarting app server…');
    // The key is read when the Next server starts, so a restart is what makes
    // a new key take effect without quitting the whole app.
    await window.braindotSettings.applyAndRestart();
    setMessage('saved', 'success');
    setTimeout(() => window.braindotSettings.close(), 350);
  } catch (err) {
    setMessage(String((err && err.message) || err), 'error');
    els.save.disabled = false;
  }
}

els.clearKey.addEventListener('click', async () => {
  clearingKey = true;
  els.key.value = '';
  els.key.placeholder = 'will be removed on save';
  const cfg = await window.braindotSettings.load();
  renderKeyStatus(cfg.OPENAI_API_KEY || {});
});

els.key.addEventListener('input', () => {
  if (!els.key.value) return;
  clearingKey = false;
  load();
});

els.reveal.addEventListener('click', () => window.braindotSettings.revealConfig());
els.logs.addEventListener('click', () => window.braindotSettings.openLog());
els.cancel.addEventListener('click', () => window.braindotSettings.close());
els.save.addEventListener('click', save);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.braindotSettings.close();
  if (e.key === 'Enter' && !els.save.disabled) save();
});

load().catch((err) => setMessage(String(err), 'error'));
