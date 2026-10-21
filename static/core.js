/* Deutsch Daily — shared runtime: storage, preferences, theme, settings popover, toast. */
(function () {
  const PREF_KEY = 'dd-prefs-v2';
  const LEGACY_PREF_KEY = 'dd-preferences';
  const SCALES = [0.86, 0.93, 1, 1.1, 1.22];

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
  };

  function loadPrefs() {
    const saved = store.get(PREF_KEY, null);
    if (saved && typeof saved === 'object') {
      return {
        theme: ['light', 'dark'].includes(saved.theme) ? saved.theme : 'system',
        size: Number.isInteger(saved.size) ? Math.min(SCALES.length - 1, Math.max(0, saved.size)) : 2,
        zh: saved.zh === true,
      };
    }
    // One-time migration from the first front end: keep dark mode and font step, but
    // start in blind-reading mode (translations hidden) as the new default.
    const legacy = store.get(LEGACY_PREF_KEY, null) || {};
    return {
      theme: legacy.theme === 'dark' ? 'dark' : 'system',
      size: Math.min(SCALES.length - 1, 2 + (Number(legacy.fontStep) || 0)),
      zh: false,
    };
  }

  const prefs = loadPrefs();
  const listeners = [];

  function applyPrefs() {
    const root = document.documentElement;
    if (prefs.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
    root.style.setProperty('--reader-scale', String(SCALES[prefs.size]));
  }
  function savePrefs() {
    store.set(PREF_KEY, prefs);
    applyPrefs();
    listeners.forEach(fn => fn(prefs));
  }
  function onPrefs(fn) { listeners.push(fn); }

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(iso, opts) {
    const d = new Date(iso + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  let toastEl, toastTimer;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1700);
  }

  /* settings popover: any [data-settings] button opens it */
  let panel, opener;
  function renderSettings() {
    const themes = [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']];
    panel.innerHTML = `
      <div><h3>外观</h3><div class="seg" role="group" aria-label="外观">${themes.map(([v, label]) =>
        `<button type="button" data-theme-choice="${v}" aria-pressed="${prefs.theme === v}">${label}</button>`).join('')}</div></div>
      <div class="row"><h3 style="margin:0">正文字号</h3><div class="size-ctl">
        <button type="button" data-size="-1" aria-label="缩小字号">A</button>
        <output>${Math.round(SCALES[prefs.size] * 100)}%</output>
        <button type="button" data-size="1" aria-label="放大字号">A</button></div></div>`;
  }
  function closeSettings(restoreFocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) opener?.focus();
  }
  function openSettings(button) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'settings';
      panel.id = 'dd-settings';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', '阅读设置');
      panel.hidden = true;
      document.body.appendChild(panel);
      panel.addEventListener('click', e => {
        const theme = e.target.closest('[data-theme-choice]');
        const size = e.target.closest('[data-size]');
        if (theme) prefs.theme = theme.dataset.themeChoice;
        else if (size) prefs.size = Math.min(SCALES.length - 1, Math.max(0, prefs.size + Number(size.dataset.size)));
        else return;
        savePrefs();
        renderSettings();
      });
    }
    opener = button;
    renderSettings();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('button')?.focus();
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-settings]');
    if (button) {
      if (panel && !panel.hidden) closeSettings(false);
      else openSettings(button);
      return;
    }
    if (panel && !panel.hidden && !e.target.closest('#dd-settings')) closeSettings(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(true); });

  /* header hairline once the page scrolls */
  function watchBar() {
    const bar = document.querySelector('.bar');
    if (!bar) return;
    const update = () => bar.classList.toggle('scrolled', scrollY > 4);
    addEventListener('scroll', update, { passive: true });
    update();
  }

  applyPrefs();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchBar);
  else watchBar();

  window.DD = { store, prefs, savePrefs, onPrefs, esc, fmtDate, toast };
})();
