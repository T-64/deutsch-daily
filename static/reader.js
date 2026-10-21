/* Deutsch Daily — lesson reader: blind reading, word lookup, notebook, Anki, video seek.
   Expects `DATA` (lesson payload from build.py) and `DD` (core.js). */
(function () {
  const { store, prefs, savePrefs, esc, fmtDate, toast } = window.DD;
  const BK_KEY = 'dd-basket';
  const GLOSS_KEY = 'dd-user-gloss';
  const RECENT_KEY = 'dd-recent-lesson';
  const $ = id => document.getElementById(id);
  const isReading = DATA.content_kind === 'reading';
  const LETTER = /[A-Za-zÄÖÜäöüß]/;
  const WORD_CHAR = /[A-Za-zÄÖÜäöüß-]/;
  const PHRASES = (DATA.phrases || []).slice().sort((a, b) => b.length - a.length);

  function normalizeItem(b) {
    return {
      key: String(b.key), word: String(b.word), zh: b.zh || '', pos: b.pos || '',
      example: b.example || b.exampleDe || '', exampleZh: b.exampleZh || '',
      date: b.date || '', topic: b.topic || '', source: b.source || '',
      createdAt: Number(b.createdAt) || 0, manual: Boolean(b.manual),
    };
  }
  const stored = store.get(BK_KEY, []);
  let basket = Array.isArray(stored) ? stored.filter(b => b && b.key && b.word).map(normalizeItem) : [];
  const userGloss = store.get(GLOSS_KEY, {}) || {};
  const saveBasket = () => store.set(BK_KEY, basket);
  const inBasket = key => basket.some(b => b.key === key);

  function getGloss(key) {
    if (userGloss[key]) return { source: 'user', ...userGloss[key] };
    return (DATA.gloss || {})[key] || null;
  }

  /* ---------- tokenising German text into clickable words ---------- */
  function lookupKey(surface) {
    const lower = surface.toLowerCase();
    return (DATA.form_to_key || {})[lower] || lower;
  }
  function wordClass(key) {
    const g = getGloss(key);
    return [g && g.source === 'editorial' ? 'ed' : '', inBasket(key) ? 'saved' : ''].filter(Boolean).join(' ');
  }
  function wrapWord(surface, key) {
    return `<w data-w="${esc(key)}" class="${wordClass(key)}" tabindex="0" role="button">${esc(surface)}</w>`;
  }
  function tokenizeDe(text) {
    let html = '';
    let i = 0;
    const lower = text.toLowerCase();
    while (i < text.length) {
      let hit = '';
      if (i === 0 || !LETTER.test(text[i - 1])) {
        for (const ph of PHRASES) {
          if (lower.startsWith(ph.toLowerCase(), i) && !LETTER.test(text[i + ph.length] || '')) { hit = text.slice(i, i + ph.length); break; }
        }
      }
      if (hit) { html += wrapWord(hit, lookupKey(hit)); i += hit.length; continue; }
      let j = i + 1;
      if (LETTER.test(text[i])) {
        while (j < text.length && WORD_CHAR.test(text[j])) j++;
        html += wrapWord(text.slice(i, j), lookupKey(text.slice(i, j)));
      } else {
        while (j < text.length && !LETTER.test(text[j])) j++;
        html += esc(text.slice(i, j));
      }
      i = j;
    }
    return html;
  }
  function clock(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- page head ---------- */
  const SHOW = DATA.source === 'einfach' ? 'tagesschau in Einfacher Sprache' : (DATA.source_label || 'tagesschau');
  const zhDate = DD.zhDate(DATA.date);
  document.title = `${zhDate} · ${SHOW} — Deutsch Daily`;
  $('title').textContent = zhDate;
  $('title-de').textContent = fmtDate(DATA.date);
  $('kicker').innerHTML = `<b>${esc(SHOW)}</b> · ${esc(DATA.level || 'A2–B1')}`;
  const sourceUrl = DATA.video_page || DATA.source_url;
  $('meta').innerHTML = [
    `${DATA.news.length} 条新闻`,
    DATA.duration ? `原声 ${Math.round(DATA.duration / 60)} 分钟` : '',
    sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">tagesschau.de 原节目 ↗</a>` : '',
  ].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  if (DATA.adaptation) { $('adaptation').textContent = DATA.adaptation; $('adaptation').hidden = false; }
  store.set(RECENT_KEY, { slug: DATA.slug, date: DATA.date, sourceLabel: DATA.source_label, title: DATA.news[0]?.title || '' });

  /* ---------- stories ---------- */
  const studyCount = n => [n.vocab.length ? `词汇 ${n.vocab.length}` : '', n.grammar_points.length ? `语法 ${n.grammar_points.length}` : ''].filter(Boolean).join(' · ');
  $('stories').innerHTML = DATA.news.map((n, i) => {
    const paras = n.paras.map((p, pi) => {
      const lines = p.lines && p.lines.length ? p.lines : [{ de: p.de || '', zh: p.zh || '', start: p.start, end: p.end }];
      return `<p class="para">${lines.map((line, li) => {
        const timed = line.start != null;
        return `<span class="sent" id="s-${i}-${pi}-${li}"${timed ? ` data-start="${line.start}" data-end="${line.end ?? line.start}"` : ''}>`
          + `<span class="de" lang="de">${tokenizeDe(line.de || '')}</span>`
          + (timed ? `<button class="seek" type="button" aria-label="从这句播放">▶ ${clock(line.start)}</button>` : '')
          + (line.zh ? `<button class="reveal" type="button" aria-expanded="false" aria-label="显示这句的中文">译</button><span class="zh">${esc(line.zh)}</span>` : '')
          + '</span>';
      }).join(' ')}</p>`;
    }).join('');
    const count = studyCount(n);
    return `<section class="story" id="story-${i + 1}" data-idx="${i}">
      <div class="story-num">${String(i + 1).padStart(2, '0')} / ${String(DATA.news.length).padStart(2, '0')}</div>
      <h2 lang="de">${esc(n.title)}</h2>${n.title_zh ? `<p class="zh title-zh">${esc(n.title_zh)}</p>` : ''}
      <div class="story-text">${paras}</div>
      ${count ? `<button class="btn secondary story-study" type="button" data-study="${i}">${count}</button>` : ''}
    </section>`;
  }).join('');

  $('toc').innerHTML = DATA.news.map((n, i) =>
    `<li><a href="#story-${i + 1}" data-idx="${i}"><span class="num">${String(i + 1).padStart(2, '0')}</span><span lang="de">${esc(n.title)}</span></a></li>`).join('');

  function renderStudy(i) {
    const n = DATA.news[i];
    const vocab = n.vocab.length ? `<h3 class="pane-h">本篇词汇</h3><ul class="vocab">${n.vocab.map(v => {
      const saved = inBasket(v.key);
      return `<li><div><span class="v-lemma" lang="de">${esc(v.lemma)}</span>${v.pos ? `<span class="v-pos">${esc(v.pos)}</span>` : ''}
        <div class="v-zh">${esc(v.zh)}</div>${v.example_de ? `<div class="v-ex" lang="de">${esc(v.example_de)}</div>` : ''}</div>
        <button class="v-add${saved ? ' in' : ''}" type="button" data-add="${esc(v.key)}" aria-label="${saved ? '已在生词本' : '加入生词本'}" title="${saved ? '已在生词本' : '加入生词本'}">${saved ? '✓' : '+'}</button></li>`;
    }).join('')}</ul>` : '';
    const grammar = n.grammar_points.length ? `<h3 class="pane-h">语法</h3>${n.grammar_points.map(g => `<div class="gram"><b>${esc(g.title)}</b>
      ${g.example_de ? `<p class="ex" lang="de">${esc(g.example_de)}</p>` : ''}${g.example_zh ? `<p class="ex-zh">${esc(g.example_zh)}</p>` : ''}
      ${g.summary ? `<p class="sum">${esc(g.summary)}</p>` : ''}</div>`).join('')}` : '';
    const background = n.background ? `<details class="bg"><summary>背景资料</summary><p>${esc(n.background)}</p><small>AI 整理，未经独立来源核验</small></details>` : '';
    $('study').innerHTML = vocab + grammar + background || '<p class="nb-empty">这一条没有单独的词汇或语法。</p>';
  }

  let active = -1;
  function setActive(i) {
    if (i < 0 || i >= DATA.news.length || i === active) return;
    active = i;
    document.querySelectorAll('#toc a').forEach((a, k) => a.setAttribute('aria-current', String(k === i)));
    renderStudy(i);
  }
  setActive(0);
  const storyWatch = new IntersectionObserver(entries => {
    const hit = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (hit) setActive(Number(hit.target.dataset.idx));
  }, { rootMargin: '-25% 0px -55% 0px', threshold: [0, .25, .5] });
  document.querySelectorAll('.story').forEach(el => storyWatch.observe(el));

  /* ---------- translations: hidden by default (blind reading) ---------- */
  function applyZh() {
    document.body.classList.toggle('show-zh', prefs.zh);
    $('zh-toggle').setAttribute('aria-pressed', String(prefs.zh));
  }
  function toggleZh() {
    prefs.zh = !prefs.zh;
    savePrefs();
    applyZh();
    toast(prefs.zh ? '显示全部译文' : '盲读：点句末「译」看单句中文');
  }
  $('zh-toggle').addEventListener('click', toggleZh);
  applyZh();

  /* ---------- follow-along training: video / audio, sentence stepping ---------- */
  const TRAIN_KEY = 'dd-train-v1';
  const train = Object.assign({ mode: 'flow', rate: 1, audio: false }, store.get(TRAIN_KEY, {}) || {});
  const saveTrain = () => store.set(TRAIN_KEY, train);
  let video = null;
  let segs = [];
  let cur = -1;
  let target = -1;

  function buildListen() {
    const list = DATA.listen || [];
    if (!list.length) return;
    $('listen').innerHTML = list.map((x, k) => `<span class="sent" id="l-${k}" data-start="${x.start}" data-end="${x.end}"><button class="seek" type="button" aria-label="从这句播放">${clock(x.start)}</button><span class="de" lang="de">${tokenizeDe(x.de)}</span></span>`).join('');
    $('listen').hidden = false;
    $('train-sub').textContent = `官方字幕 ${list.length} 句 · 点时间跳播，点词查义`;
  }
  function segAt(t) {
    let k = -1;
    for (let i = 0; i < segs.length; i++) { if (segs[i].a <= t + 0.05) k = i; else break; }
    return k;
  }
  function mark(k) {
    if (k === cur) return;
    segs[cur]?.el.classList.remove('now');
    cur = k;
    const s = segs[k];
    if (!s) { $('dock-text').textContent = ''; return; }
    s.el.classList.add('now');
    $('dock-text').textContent = s.el.querySelector('.de').textContent;
    const box = s.el.closest('.listen');
    if (box) box.scrollTo({ top: s.el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
    else if (!video.paused) s.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function playFrom(k) {
    if (!video || !segs.length) return;
    k = Math.max(0, Math.min(segs.length - 1, k));
    target = k;
    video.currentTime = segs[k].a;
    mark(k);
    video.play().catch(() => {});
  }
  function toggle() {
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    // In stepped modes, "play" continues with the next sentence after a stop.
    const k = segAt(video.currentTime);
    if (train.mode !== 'flow' && segs[k] && video.currentTime >= segs[k].b - 0.05) playFrom(k + 1);
    else { target = k; video.play().catch(() => {}); }
  }
  const step = d => playFrom((cur < 0 ? segAt(video?.currentTime || 0) : cur) + d);
  function syncControls() {
    $('tr-mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === train.mode)));
    $('tr-speed').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === train.rate)));
    $('tr-audio').setAttribute('aria-pressed', String(train.audio));
    $('train').classList.toggle('audio', train.audio);
    if (video) video.playbackRate = train.rate;
  }
  function syncPlay() {
    const playing = video && !video.paused;
    document.querySelectorAll('.tr-play').forEach(b => { b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? '暂停（空格）' : '播放（空格）'); });
  }
  function mountTraining() {
    if (!DATA.mp4_url && !DATA.embed_url) return;
    $('train').hidden = false;
    if (isReading) $('read-h').hidden = false;
    buildListen();
    const fail = () => {
      video = null;
      $('player').innerHTML = DATA.embed_url ? `<iframe src="${esc(DATA.embed_url)}" title="tagesschau 视频" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>` : '';
      $('player').hidden = !DATA.embed_url;
      document.querySelector('.train-bar').hidden = true;
      document.body.classList.remove('has-av');
      const page = DATA.video_page ? ` <a href="${esc(DATA.video_page)}" target="_blank" rel="noopener">到 tagesschau.de 观看 ↗</a>` : '';
      $('tr-fail').innerHTML = `视频暂时无法加载，跟读控制不可用。${page}`;
      $('tr-fail').hidden = false;
    };
    if (!DATA.mp4_url) { fail(); return; }
    $('player').innerHTML = `<video playsinline preload="metadata" src="${esc(DATA.mp4_url)}"></video>`;
    video = $('player').querySelector('video');
    video.addEventListener('error', fail, { once: true });
    video.addEventListener('click', toggle);
    segs = [...document.querySelectorAll(isReading ? '#listen .sent[data-start]' : '#stories .sent[data-start]')]
      .map(el => ({ el, a: Number(el.dataset.start), b: Number(el.dataset.end) }))
      .sort((x, y) => x.a - y.a);
    if (segs.length) document.body.classList.add('has-av');
    video.addEventListener('loadedmetadata', () => { video.playbackRate = train.rate; });
    ['play', 'pause'].forEach(ev => video.addEventListener(ev, () => { syncPlay(); updateDock(); }));
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      const d = video.duration || DATA.duration || 0;
      $('tr-time').textContent = `${clock(t)} / ${clock(d)}`;
      if (d && document.activeElement !== $('tr-seek')) $('tr-seek').value = String(Math.round(t / d * 1000));
      const s = segs[target];
      if (train.mode !== 'flow' && s && t >= s.b + 0.12) {
        if (train.mode === 'loop') { video.currentTime = s.a; return; }
        video.pause();
        video.currentTime = Math.max(s.a, s.b - 0.02);
        return;
      }
      const k = segAt(t);
      if (train.mode === 'flow' || target < 0) target = k;
      mark(k);
    });
    $('tr-seek').addEventListener('input', e => {
      if (!video.duration) return;
      video.currentTime = Number(e.target.value) / 1000 * video.duration;
      target = segAt(video.currentTime);
    });
    $('tr-play').addEventListener('click', toggle);
    $('tr-prev').addEventListener('click', () => step(-1));
    $('tr-next').addEventListener('click', () => step(1));
    $('tr-again').addEventListener('click', () => playFrom(cur < 0 ? 0 : cur));
    $('tr-mode').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      train.mode = b.dataset.mode;
      target = segAt(video.currentTime);
      saveTrain(); syncControls();
      toast({ flow: '连续播放', stop: '逐句跟读：每句播完暂停，按空格继续下一句', loop: '单句循环：←/→ 换句' }[train.mode]);
    });
    $('tr-speed').addEventListener('click', e => {
      const b = e.target.closest('[data-rate]');
      if (!b) return;
      train.rate = Number(b.dataset.rate);
      saveTrain(); syncControls();
    });
    $('tr-audio').addEventListener('click', () => { train.audio = !train.audio; saveTrain(); syncControls(); });
    $('dock').addEventListener('click', e => {
      const act = e.target.closest('[data-dock]')?.dataset.dock;
      if (act === 'play') toggle();
      else if (act === 'prev') step(-1);
      else if (act === 'next') step(1);
    });
    new IntersectionObserver(([entry]) => { trainVisible = entry.isIntersecting; updateDock(); }).observe(document.querySelector('.train-bar'));
    syncControls();
    syncPlay();
    $('hint').insertAdjacentText('beforeend', isReading ? '' : ' 点有时间的句子可以跳播。');
  }
  let trainVisible = true;
  let started = false;
  function updateDock() {
    if (video && !video.paused) started = true;
    $('dock').hidden = !video || !started || trainVisible;
    document.body.classList.toggle('docked', !$('dock').hidden);
  }
  mountTraining();

  /* ---------- side panel: desktop column, mobile bottom sheet ---------- */
  const side = $('side');
  const sheetMode = () => matchMedia('(max-width: 1080px)').matches;
  function selectTab(tab) {
    ['study', 'notebook'].forEach(name => {
      $('tab-' + name).setAttribute('aria-selected', String(name === tab));
      $('pane-' + name).hidden = name !== tab;
    });
  }
  function openSide(tab) {
    selectTab(tab);
    if (!sheetMode()) return;
    side.classList.add('open');
    $('scrim').hidden = false;
    setTimeout(() => $('side-close').focus(), 0);
  }
  function closeSide() {
    if (!side.classList.contains('open')) return;
    side.classList.remove('open');
    $('scrim').hidden = true;
  }
  document.querySelectorAll('[data-open-side]').forEach(b => b.addEventListener('click', () => openSide(b.dataset.openSide)));
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  $('side-close').addEventListener('click', closeSide);
  $('scrim').addEventListener('click', () => { closeSide(); hidePop(); });
  $('toc').addEventListener('click', e => {
    const a = e.target.closest('a[data-idx]');
    if (!a) return;
    e.preventDefault();
    closeSide();
    setActive(Number(a.dataset.idx));
    $('story-' + (Number(a.dataset.idx) + 1)).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- reader clicks: reveal, seek, words, study shortcut ---------- */
  $('stories').addEventListener('click', e => {
    const reveal = e.target.closest('.reveal');
    if (reveal) {
      const sent = reveal.closest('.sent');
      const open = sent.classList.toggle('revealed');
      reveal.setAttribute('aria-expanded', String(open));
      return;
    }
    const seek = e.target.closest('.seek');
    if (seek && video) { playFrom(segs.findIndex(x => x.el === seek.closest('.sent'))); return; }
    const study = e.target.closest('[data-study]');
    if (study) { setActive(Number(study.dataset.study)); openSide('study'); return; }
    const w = e.target.closest('w');
    if (w) { e.stopPropagation(); showPop(w); }
  });
  $('listen').addEventListener('click', e => {
    const w = e.target.closest('w');
    if (w) { e.stopPropagation(); showPop(w); return; }
    const seek = e.target.closest('.seek');
    if (seek && video) playFrom(segs.findIndex(x => x.el === seek.closest('.sent')));
  });
  $('listen').addEventListener('keydown', e => {
    const w = e.target.closest('w');
    if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPop(w); }
  });
  $('stories').addEventListener('keydown', e => {
    const w = e.target.closest('w');
    if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPop(w); }
  });

  /* ---------- word popover ---------- */
  const pop = $('pop');
  let popWord = null;
  let popAnchor = null;
  function sentenceOf(wEl) {
    const de = wEl.closest('.sent')?.querySelector('.de');
    const text = (de?.textContent || '').replace(/\s+/g, ' ').trim();
    return text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/).find(s => s.includes(wEl.textContent)) || text;
  }
  function boldWord(sentence, word) {
    const at = sentence.indexOf(word);
    if (at < 0) return esc(sentence);
    return esc(sentence.slice(0, at)) + `<b>${esc(word)}</b>` + esc(sentence.slice(at + word.length));
  }
  const SOURCE_LABEL = { editorial: '本篇重点词', dict: '离线词典', user: '我的释义' };
  function showPop(wEl) {
    const key = wEl.dataset.w;
    const g = getGloss(key) || {};
    const story = wEl.closest('.story');
    popWord = {
      key, surface: wEl.textContent, word: g.word || wEl.textContent, zh: g.zh || '', pos: g.pos || '',
      source: g.source || '', example: sentenceOf(wEl) || g.example || '',
      topic: story ? DATA.news[Number(story.dataset.idx)].title : '原声',
    };
    popAnchor?.classList.remove('active');
    popAnchor = wEl;
    wEl.classList.add('active');
    renderPop();
  }
  function renderPop() {
    const p = popWord;
    const saved = inBasket(p.key);
    const meta = [p.pos, SOURCE_LABEL[p.source]].filter(Boolean).join(' · ');
    pop.innerHTML = `
      <div class="pop-head"><div><div class="pop-word" lang="de">${esc(p.word)}</div>${meta ? `<div class="pop-meta">${esc(meta)}</div>` : ''}</div>
        <button class="btn-icon pop-close" type="button" data-pop="close" aria-label="关闭">×</button></div>
      <div class="pop-zh${p.zh ? '' : ' empty'}">${p.zh ? esc(p.zh) : '词典里没有这个词形，可以自己补一条释义。'}</div>
      ${p.example ? `<p class="pop-ex" lang="de">${boldWord(p.example, p.surface)}</p>` : ''}
      <div class="pop-actions">
        <button class="btn-quiet" type="button" data-pop="edit">${p.zh ? '编辑释义' : '补充释义'}</button>
        <button class="btn${saved ? ' secondary' : ''}" type="button" data-pop="save"${saved ? ' disabled' : ''}>${saved ? '✓ 已在生词本' : '加入生词本'}</button>
      </div>`;
    showAt();
    pop.querySelector(saved ? '[data-pop="edit"]' : '[data-pop="save"]').focus({ preventScroll: true });
  }
  function renderPopEditor() {
    const p = popWord;
    pop.innerHTML = `
      <div class="pop-head"><div class="pop-word" lang="de">${esc(p.word)}</div><button class="btn-icon pop-close" type="button" data-pop="close" aria-label="关闭">×</button></div>
      <form id="pop-form">
        <label class="field">词形<input id="pop-word" required value="${esc(p.word)}" lang="de"></label>
        <label class="field">中文释义<input id="pop-zh" required value="${esc(p.zh)}" placeholder="写下你的理解"></label>
        <label class="field">例句（可选）<textarea id="pop-example" lang="de">${esc(p.example)}</textarea></label>
        <div class="form-actions"><button class="btn-quiet" type="button" data-pop="close">取消</button><button class="btn" type="submit">保存并加入生词本</button></div>
      </form>`;
    showAt();
    $('pop-form').addEventListener('submit', e => {
      e.preventDefault();
      const custom = { word: $('pop-word').value.trim(), zh: $('pop-zh').value.trim(), pos: p.pos, example: $('pop-example').value.trim() };
      if (!custom.word || !custom.zh) return;
      userGloss[p.key] = custom;
      store.set(GLOSS_KEY, userGloss);
      Object.assign(popWord, custom, { source: 'user' });
      upsertBasket(popWord);
      hidePop();
      toast('已保存到生词本');
    });
    setTimeout(() => $('pop-zh').focus(), 0);
  }
  function showAt() {
    pop.hidden = false;
    if (matchMedia('(max-width: 720px)').matches || !popAnchor) return;
    const r = popAnchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    let y = r.bottom + 8;
    if (y + h > innerHeight - 12) y = Math.max(12, r.top - h - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  function hidePop() {
    if (pop.hidden) return;
    pop.hidden = true;
    popAnchor?.classList.remove('active');
    popAnchor = null;
  }
  pop.addEventListener('click', e => {
    const act = e.target.closest('[data-pop]')?.dataset.pop;
    if (act === 'close') hidePop();
    else if (act === 'edit') renderPopEditor();
    else if (act === 'save') {
      if (!popWord.zh) { renderPopEditor(); return; }
      upsertBasket(popWord);
      hidePop();
      toast('已加入生词本');
    }
  });
  document.addEventListener('click', e => {
    if (!pop.hidden && !e.target.closest('#pop') && !e.target.closest('w')) hidePop();
  });
  addEventListener('resize', () => { if (!pop.hidden) showAt(); });
  addEventListener('scroll', () => { if (!pop.hidden && !matchMedia('(max-width: 720px)').matches) hidePop(); }, { passive: true });

  /* ---------- notebook ---------- */
  function upsertBasket(p) {
    const existing = basket.find(b => b.key === p.key);
    const fields = { word: p.word, zh: p.zh, pos: p.pos || '', example: p.example || '' };
    if (existing) Object.assign(existing, fields);
    else basket.push(normalizeItem({ key: p.key, ...fields, date: DATA.date, topic: p.topic || '', source: p.source || '', createdAt: Date.now(), manual: p.manual }));
    saveBasket();
    refreshMarks();
  }
  function refreshMarks() {
    document.querySelectorAll('w').forEach(w => w.className = [wordClass(w.dataset.w), w === popAnchor ? 'active' : ''].filter(Boolean).join(' '));
    document.querySelectorAll('[data-nb-count]').forEach(el => { el.textContent = basket.length; });
    renderStudy(active);
    renderNotebook();
  }
  function renderNotebook() {
    const list = $('nb-list');
    if (!basket.length) {
      list.innerHTML = '<li class="nb-empty"><b>生词本还是空的</b>点正文里的任意单词，或者手动添加一个。</li>';
      return;
    }
    const items = [...basket].sort((a, b) => b.createdAt - a.createdAt);
    list.innerHTML = items.map(b => `<li>
      <div class="nb-word" lang="de">${esc(b.word)}</div><div class="nb-zh">${esc(b.zh || '未填写释义')}</div>
      ${b.example ? `<div class="nb-ex" lang="de">${esc(b.example)}</div>` : ''}
      <div class="nb-row"><span>${esc(b.date || '手动添加')}</span><span>
        <button type="button" data-nb-edit="${esc(b.key)}">编辑</button><button type="button" class="danger" data-nb-del="${esc(b.key)}">删除</button></span></div></li>`).join('');
  }
  let editingKey = null;
  function openForm(key) {
    editingKey = key || null;
    const item = key ? basket.find(b => b.key === key) : null;
    $('nb-word').value = item?.word || '';
    $('nb-zh').value = item?.zh || '';
    $('nb-example').value = item?.example || '';
    $('nb-form').hidden = false;
    $('nb-word').focus();
  }
  function closeForm() { editingKey = null; $('nb-form').hidden = true; $('nb-form').reset(); }
  $('nb-add').addEventListener('click', () => openForm(null));
  $('nb-cancel').addEventListener('click', closeForm);
  $('nb-form').addEventListener('submit', e => {
    e.preventDefault();
    const word = $('nb-word').value.trim();
    const zh = $('nb-zh').value.trim();
    const example = $('nb-example').value.trim();
    if (!word || !zh) return;
    const key = editingKey || word.toLocaleLowerCase('de-DE');
    const wasEditing = Boolean(editingKey);
    userGloss[key] = { word, zh, example, pos: '' };
    store.set(GLOSS_KEY, userGloss);
    upsertBasket({ key, word, zh, example, manual: !wasEditing });
    closeForm();
    toast(wasEditing ? '已更新' : '已添加');
  });
  $('nb-list').addEventListener('click', e => {
    const edit = e.target.closest('[data-nb-edit]');
    const del = e.target.closest('[data-nb-del]');
    if (edit) openForm(edit.dataset.nbEdit);
    if (del) {
      basket = basket.filter(b => b.key !== del.dataset.nbDel);
      saveBasket();
      refreshMarks();
    }
  });
  $('study').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (!add) return;
    const n = DATA.news.find(x => x.vocab.some(v => v.key === add.dataset.add));
    const v = n?.vocab.find(x => x.key === add.dataset.add);
    if (!v || inBasket(v.key)) return;
    upsertBasket({ key: v.key, word: v.lemma, zh: v.zh, pos: v.pos, example: v.example_de, topic: n.title, source: 'editorial' });
    toast('已加入生词本');
  });
  $('nb-copy').addEventListener('click', () => {
    if (!basket.length) { toast('生词本是空的'); return; }
    const text = basket.map(b => [b.word, b.zh, b.example].filter(Boolean).join('\t')).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast(`已复制 ${basket.length} 个词`), () => toast('复制失败，请检查浏览器权限'));
  });
  $('nb-anki').addEventListener('click', async () => {
    const button = $('nb-anki');
    const status = $('nb-status');
    if (!basket.length) { toast('生词本是空的'); return; }
    button.disabled = true;
    try {
      const n = await window.DDAnki.exportApkg(basket, msg => { status.textContent = msg; });
      status.textContent = `已导出 ${n} 张卡片，在 Anki 里导入即可`;
    } catch (err) {
      status.textContent = `导出失败：${err.message}。可以先用「复制文本」。`;
    } finally {
      button.disabled = false;
    }
  });
  refreshMarks();

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hidePop(); closeSide(); return; }
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') toggleZh();
    if (!video) return;
    // Space drives the player everywhere except inside the popover, side panel and links/words.
    if (e.key === ' ' && !e.target.closest('#pop, #side, #dd-settings, a, w')) { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'r' || e.key === 'R') playFrom(cur < 0 ? 0 : cur);
  });
})();
