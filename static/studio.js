(function (root) {
  'use strict';

  const STORE_KEY = 'dd-local-lessons-v1';
  const BASKET_KEY = 'dd-basket';
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_CUES = 2000;
  const localMedia = new Map();

  function parseTimestamp(value) {
    const match = String(value || '').trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?$/);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number((match[4] || '').padEnd(3, '0'));
    if (minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  function plainText(value) {
    if (typeof document === 'undefined') return String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    const box = document.createElement('div');
    box.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');
    return (box.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseTimedText(raw) {
    const normalized = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/i.test(lines[0])) continue;
      const timingIndex = lines.findIndex(line => line.includes('-->'));
      if (timingIndex < 0) continue;
      const timing = lines[timingIndex].split('-->');
      const start = parseTimestamp(timing[0]);
      const endToken = (timing[1] || '').trim().split(/\s+/)[0];
      const end = parseTimestamp(endToken);
      const text = plainText(lines.slice(timingIndex + 1).join(' '));
      if (start === null || end === null || end <= start || !text) continue;
      cues.push({ start, end, text });
      if (cues.length > MAX_CUES) throw new Error(`字幕超过 ${MAX_CUES} 条，请先拆分文件。`);
    }
    return cues.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function parsePlainLines(raw) {
    return String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  }

  function overlap(a, b) {
    return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  }

  function pairCues(deCues, translationRaw) {
    if (!translationRaw || !String(translationRaw).trim()) {
      return deCues.map(cue => ({ ...cue, de: cue.text, zh: '' }));
    }
    const timed = parseTimedText(translationRaw);
    if (!timed.length) {
      const lines = parsePlainLines(translationRaw);
      if (lines.length !== deCues.length) {
        throw new Error(`译文有 ${lines.length} 行，德语字幕有 ${deCues.length} 条；请让它们逐条对应。`);
      }
      return deCues.map((cue, index) => ({ ...cue, de: cue.text, zh: lines[index] }));
    }
    if (timed.length === deCues.length) {
      return deCues.map((cue, index) => ({ ...cue, de: cue.text, zh: timed[index].text }));
    }
    const pairs = deCues.map(cue => {
      const matches = timed.filter(item => overlap(cue, item) > 0 || Math.abs(item.start - cue.start) < 0.35);
      return { ...cue, de: cue.text, zh: matches.map(item => item.text).join('') };
    });
    const covered = pairs.filter(pair => pair.zh).length / Math.max(1, pairs.length);
    if (covered < 0.8) {
      throw new Error(`译文时间轴只能匹配 ${Math.round(covered * 100)}% 的德语字幕，请改用逐行译文或相同时间轴。`);
    }
    return pairs;
  }

  const NON_TERMINALS = new Set(['bzw.', 'ca.', 'd.h.', 'dr.', 'etc.', 'nr.', 'prof.', 'u.a.', 'usw.', 'z.b.']);

  function endsSentence(text) {
    const value = String(text || '').trim().replace(/[»”"')\]]+$/, '');
    if (/[!?…]$/.test(value)) return true;
    if (!value.endsWith('.')) return false;
    const token = value.split(/\s+/).at(-1).toLowerCase();
    return !NON_TERMINALS.has(token) && !/^\d+\.$/.test(token) && !/^(?:[a-zäöüß]\.){1,3}$/.test(token);
  }

  function coalesceSentencePairs(pairs) {
    const output = [];
    let current = null;
    pairs.forEach((cue, index) => {
      if (!current) current = { start: cue.start, end: cue.end, de: cue.de.trim(), zh: cue.zh.trim() };
      else {
        current.end = cue.end;
        current.de += (/^[,.;:!?…]/.test(cue.de) ? '' : ' ') + cue.de.trim();
        current.zh += cue.zh.trim();
      }
      const next = pairs[index + 1];
      const longEnough = current.end - current.start >= 18;
      const gapAfter = next && next.start - cue.end > 1.5;
      if (endsSentence(current.de) || longEnough || gapAfter || !next) {
        output.push(current);
        current = null;
      }
    });
    return output;
  }

  function youtubeId(raw) {
    try {
      const url = new URL(raw);
      if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (/(^|\.)youtube\.com$/.test(url.hostname)) {
        if (url.pathname === '/watch') return url.searchParams.get('v') || '';
        const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
        return match ? match[1] : '';
      }
    } catch {}
    return '';
  }

  function safeHttpUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 http:// 或 https:// 链接。');
    return url.href;
  }

  function readLessons() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && item.id && Array.isArray(item.cues)) : [];
    } catch { return []; }
  }

  function writeLessons(lessons) {
    localStorage.setItem(STORE_KEY, JSON.stringify(lessons.slice(0, 20)));
  }

  function makeId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return `lesson-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function wordsHtml(text) {
    let cursor = 0;
    let out = '';
    const re = /[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*/g;
    for (const match of String(text || '').matchAll(re)) {
      out += escapeHtml(text.slice(cursor, match.index));
      out += `<button type="button" class="word" data-word="${escapeHtml(match[0])}" aria-label="${escapeHtml(match[0])}，添加释义">${escapeHtml(match[0])}</button>`;
      cursor = match.index + match[0].length;
    }
    return out + escapeHtml(text.slice(cursor));
  }

  function initStudio(doc) {
    const formView = doc.getElementById('form-view');
    const readerView = doc.getElementById('reader-view');
    const library = doc.getElementById('library-list');
    const form = doc.getElementById('course-form');
    const error = doc.getElementById('form-error');
    const preview = doc.getElementById('preview');
    const previewRows = doc.getElementById('preview-rows');
    const saveButton = doc.getElementById('save-course');
    const sourceField = doc.getElementById('source-url');
    const mediaFileField = doc.getElementById('media-file');
    const deField = doc.getElementById('subtitle-de');
    const zhField = doc.getElementById('subtitle-zh');
    let pending = null;
    let activeLesson = null;
    let activeVideo = null;
    let selectedWord = null;
    let selectedExample = '';

    function announce(message, kind = '') {
      error.textContent = message;
      error.dataset.kind = kind;
    }

    function sourceFromHash() {
      const raw = location.hash.slice(1);
      if (!raw || raw.startsWith('lesson=')) return '';
      const value = raw.startsWith('source=') ? raw.slice(7) : raw;
      try { return decodeURIComponent(value); } catch { return value; }
    }

    function renderLibrary() {
      const lessons = readLessons().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      doc.getElementById('library-count').textContent = lessons.length ? `${lessons.length} 个本地课程` : '还没有本地课程';
      library.innerHTML = lessons.length ? lessons.map(lesson => `
        <article class="library-item">
          <a href="#lesson=${encodeURIComponent(lesson.id)}"><span>${escapeHtml(lesson.title)}</span><small>${lesson.cues.length} 句 · ${new Date(lesson.updatedAt).toLocaleDateString('zh-CN')}</small></a>
          <button type="button" class="delete-course" data-id="${escapeHtml(lesson.id)}" aria-label="删除 ${escapeHtml(lesson.title)}">删除</button>
        </article>`).join('') : '<div class="empty">创建后的字幕课程只保存在这个浏览器中。</div>';
    }

    async function readSmallFile(file, label) {
      if (!file) return '';
      if (file.size > MAX_FILE_BYTES) throw new Error(`${label}超过 2 MB，请先拆分。`);
      return file.text();
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      announce('');
      preview.hidden = true;
      saveButton.disabled = true;
      pending = null;
      try {
        const title = doc.getElementById('course-title').value.trim();
        const deFile = deField.files[0];
        if (!title) throw new Error('请给课程起一个标题。');
        if (!deFile) throw new Error('请选择德语 SRT 或 VTT 字幕。');
        if (!doc.getElementById('rights').checked) throw new Error('请先确认你有权处理这份媒体和字幕。');
        const sourceUrl = safeHttpUrl(sourceField.value);
        const mediaUrl = safeHttpUrl(doc.getElementById('media-url').value);
        const deRaw = await readSmallFile(deFile, '德语字幕');
        const zhRaw = await readSmallFile(zhField.files[0], '中文字幕');
        const deCues = parseTimedText(deRaw);
        if (!deCues.length) throw new Error('没有读到有效字幕，请检查文件是否为 SRT 或 WebVTT。');
        const cues = coalesceSentencePairs(pairCues(deCues, zhRaw));
        const mediaFile = mediaFileField.files[0] || null;
        pending = {
          id: makeId(), title, sourceUrl, mediaUrl, mediaName: mediaFile ? mediaFile.name : '',
          cues, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
        };
        if (mediaFile) localMedia.set(pending.id, URL.createObjectURL(mediaFile));
        const translated = cues.filter(cue => cue.zh).length;
        doc.getElementById('preview-summary').textContent = `${cues.length} 句 · ${formatTime(cues.at(-1).end)} · ${translated ? `${translated} 句有译文` : '暂无译文'}`;
        previewRows.innerHTML = cues.slice(0, 3).map(cue => `<div><b>${escapeHtml(cue.de)}</b>${cue.zh ? `<span>${escapeHtml(cue.zh)}</span>` : '<span class="muted">未提供中文译文</span>'}</div>`).join('');
        preview.hidden = false;
        saveButton.disabled = false;
        preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        announce(err.message || '无法读取这些文件。', 'error');
      }
    });

    saveButton.addEventListener('click', () => {
      if (!pending) return;
      try {
        writeLessons([pending, ...readLessons().filter(item => item.id !== pending.id)]);
        location.hash = `lesson=${encodeURIComponent(pending.id)}`;
      } catch (err) {
        announce('浏览器本地空间不足，课程没有保存；请删除旧课程或缩短字幕。', 'error');
      }
    });

    library.addEventListener('click', event => {
      const button = event.target.closest('.delete-course');
      if (!button) return;
      const lessons = readLessons();
      const lesson = lessons.find(item => item.id === button.dataset.id);
      if (!lesson || !confirm(`删除本地课程“${lesson.title}”？字幕数据将无法恢复。`)) return;
      writeLessons(lessons.filter(item => item.id !== lesson.id));
      renderLibrary();
    });

    doc.getElementById('import-course').addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const raw = await readSmallFile(file, '课程文件');
        const value = JSON.parse(raw);
        if (!value || !value.title || !Array.isArray(value.cues) || !value.cues.length || value.cues.length > MAX_CUES) throw new Error('格式错误');
        const lesson = {
          id: makeId(), title: String(value.title).slice(0, 120), sourceUrl: safeHttpUrl(value.sourceUrl || ''),
          mediaUrl: safeHttpUrl(value.mediaUrl || ''), mediaName: '',
          cues: value.cues.map(cue => ({ start: Number(cue.start), end: Number(cue.end), de: String(cue.de || ''), zh: String(cue.zh || '') })).filter(cue => cue.end > cue.start && cue.de),
          createdAt: Date.now(), updatedAt: Date.now(), version: 1,
        };
        if (!lesson.cues.length) throw new Error('格式错误');
        writeLessons([lesson, ...readLessons()]);
        location.hash = `lesson=${encodeURIComponent(lesson.id)}`;
      } catch {
        announce('这个 JSON 不是有效的 Deutsch Daily 本地课程。', 'error');
      } finally { event.target.value = ''; }
    });

    function mountMedia(lesson) {
      const holder = doc.getElementById('lesson-media');
      const objectUrl = localMedia.get(lesson.id);
      const src = objectUrl || lesson.mediaUrl;
      const yt = youtubeId(lesson.sourceUrl);
      activeVideo = null;
      if (src) {
        holder.innerHTML = `<video controls preload="metadata" src="${escapeHtml(src)}"></video>`;
        activeVideo = holder.querySelector('video');
        activeVideo.addEventListener('timeupdate', markActiveCue);
      } else if (yt) {
        holder.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(yt)}?enablejsapi=1" title="YouTube 视频播放器" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        holder.innerHTML = `<div class="media-empty"><b>字幕课程已经保存</b><span>${lesson.mediaName ? `浏览器不会长期保存本地媒体，请重新选择“${escapeHtml(lesson.mediaName)}”。` : '添加本地媒体后即可逐句跳播；字幕仍可单独阅读。'}</span><label class="button secondary">选择本地媒体<input id="reattach-media" type="file" accept="video/*,audio/*" hidden></label>${lesson.sourceUrl ? `<a class="button ghost" href="${escapeHtml(lesson.sourceUrl)}" target="_blank" rel="noopener">打开原页面</a>` : ''}</div>`;
        holder.querySelector('#reattach-media')?.addEventListener('change', event => {
          const file = event.target.files[0];
          if (!file) return;
          localMedia.set(lesson.id, URL.createObjectURL(file));
          mountMedia(lesson);
        });
      }
    }

    function renderCues(lesson) {
      doc.getElementById('lesson-cues').innerHTML = lesson.cues.map((cue, index) => `
        <article class="cue" data-index="${index}" data-start="${cue.start}">
          <button type="button" class="cue-time" aria-label="跳到 ${formatTime(cue.start)}">${formatTime(cue.start)}</button>
          <div><p class="cue-de">${wordsHtml(cue.de)}</p>${cue.zh ? `<p class="cue-zh">${escapeHtml(cue.zh)}</p>` : '<p class="cue-zh missing">没有译文</p>'}</div>
        </article>`).join('');
    }

    function markActiveCue() {
      if (!activeVideo || !activeLesson) return;
      const time = activeVideo.currentTime;
      let current = -1;
      activeLesson.cues.forEach((cue, index) => { if (time >= cue.start && time < cue.end) current = index; });
      doc.querySelectorAll('.cue').forEach((node, index) => node.classList.toggle('active', index === current));
    }

    doc.getElementById('lesson-cues').addEventListener('click', event => {
      const word = event.target.closest('.word');
      if (word) {
        selectedWord = word.dataset.word;
        selectedExample = word.closest('.cue').querySelector('.cue-de').textContent.trim();
        doc.getElementById('word-title').textContent = selectedWord;
        doc.getElementById('word-zh').value = '';
        doc.getElementById('word-dialog').showModal();
        setTimeout(() => doc.getElementById('word-zh').focus(), 0);
        return;
      }
      const cue = event.target.closest('.cue');
      if (!cue || !activeLesson) return;
      const seconds = Number(cue.dataset.start || 0);
      if (activeVideo) {
        activeVideo.currentTime = seconds;
        activeVideo.play().catch(() => {});
      } else {
        const frame = doc.querySelector('#lesson-media iframe');
        frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*');
      }
    });

    doc.getElementById('word-form').addEventListener('submit', event => {
      event.preventDefault();
      const zh = doc.getElementById('word-zh').value.trim();
      if (!selectedWord || !zh) return;
      let basket = [];
      try { basket = JSON.parse(localStorage.getItem(BASKET_KEY) || '[]'); } catch {}
      if (!Array.isArray(basket)) basket = [];
      const key = selectedWord.toLowerCase();
      basket = basket.filter(item => item.key !== key);
      basket.push({ key, word: selectedWord, zh, pos: '', example: selectedExample, date: '', topic: activeLesson?.title || '', source: 'local-course', createdAt: Date.now() });
      localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
      doc.getElementById('word-dialog').close();
      updateBasketCount();
      doc.getElementById('reader-status').textContent = `“${selectedWord}”已加入生词本`;
    });

    function updateBasketCount() {
      let count = 0;
      try { const basket = JSON.parse(localStorage.getItem(BASKET_KEY) || '[]'); count = Array.isArray(basket) ? basket.length : 0; } catch {}
      doc.getElementById('basket-count').textContent = `${count} 个生词`;
    }

    doc.getElementById('toggle-zh').addEventListener('click', event => {
      const hidden = readerView.classList.toggle('hide-zh');
      event.currentTarget.setAttribute('aria-pressed', String(hidden));
      event.currentTarget.textContent = hidden ? '显示译文' : '隐藏译文';
    });

    doc.getElementById('export-course').addEventListener('click', () => {
      if (!activeLesson) return;
      const data = { version: 1, title: activeLesson.title, sourceUrl: activeLesson.sourceUrl, mediaUrl: activeLesson.mediaUrl, cues: activeLesson.cues };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = doc.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${activeLesson.title.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'deutsch-daily-course'}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    function showReader(id) {
      const lesson = readLessons().find(item => item.id === id);
      if (!lesson) {
        location.hash = '';
        announce('没有找到这个本地课程，它可能已被删除。', 'error');
        return;
      }
      activeLesson = lesson;
      formView.hidden = true;
      readerView.hidden = false;
      doc.title = `${lesson.title} — Deutsch Daily`;
      doc.getElementById('lesson-title').textContent = lesson.title;
      doc.getElementById('lesson-meta').textContent = `${lesson.cues.length} 句 · ${formatTime(lesson.cues.at(-1).end)} · 仅存本机`;
      renderCues(lesson);
      mountMedia(lesson);
      updateBasketCount();
      root.scrollTo(0, 0);
    }

    function showForm() {
      activeLesson = null;
      activeVideo = null;
      readerView.hidden = true;
      formView.hidden = false;
      doc.title = '创建本地课程 — Deutsch Daily';
      renderLibrary();
      const source = sourceFromHash();
      if (source && !sourceField.value) {
        sourceField.value = source;
        if (/\.(?:mp4|webm|mp3|m4a|ogg|wav)(?:[?#]|$)/i.test(source)) doc.getElementById('media-url').value = source;
      }
    }

    function route() {
      const match = location.hash.match(/^#lesson=([^&]+)/);
      if (match) showReader(decodeURIComponent(match[1]));
      else showForm();
    }

    root.addEventListener('hashchange', route);
    route();
  }

  const api = { parseTimestamp, parseTimedText, parsePlainLines, pairCues, coalesceSentencePairs, youtubeId, formatTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DDStudio = api;
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => initStudio(document));
})(typeof window !== 'undefined' ? window : globalThis);
