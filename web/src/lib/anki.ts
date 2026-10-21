// @ts-nocheck — ported verbatim from the first front end (static/anki.js); exercised manually in Anki.

const SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm';
const SQLJS_JS  = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js';

function loadScript(src) {
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => no(new Error('load fail: ' + src));
    document.head.appendChild(s);
  });
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function exportApkg(words, status = (_m) => {}) {
  if (!words.length) throw new Error('生词本是空的');
  status('加载 sql.js…');
  if (!window.initSqlJs) {
    await loadScript(SQLJS_JS);
    window.initSqlJs = window.initSqlJs.bind({ locateFile: () => SQLJS_URL });
  }
  const SQL = await window.initSqlJs({ locateFile: () => SQLJS_URL });

  status('构建牌组…');
  const db = new SQL.Database();

  // apkg = collection.anki2 + media(空json) — 最小合法集
  db.run(`CREATE TABLE col(
    id integer primary key, crt integer, mod integer, scm integer, ver integer,
    dty integer, usn integer, ls integer, conf text, models text, decks text,
    dconf text, tags text)`);
  const now = Math.floor(Date.now() / 1000);
  const mid = Date.now();
  const deckId = now * 1000;
  const model = {
    [mid]: {
      id: mid, name: 'Deutsch Daily', type: 0, mod: now, usn: 0, sortf: 0,
      did: deckId, tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}', bqfmt: '', bafmt: '' }],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Back',  ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] }
      ],
      css: `.card{font-family:-apple-system,'Noto Sans SC',sans-serif;font-size:20px;text-align:center;color:#1F2328;background:#FAF7F2;padding:24px}.card b{color:#B3541E}`,
      latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      latexPost: '\\end{document}',
      req: [[0, 'all', [0]]], tags: [], vers: []
    }
  };
  const decks = {
    "1": { id: 1, name: 'Default', mod: now, usn: 0, lrnToday: [0,0], revToday: [0,0], newToday: [0,0], timeToday: [0,0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 10, extendRev: 50 },
    [deckId]: { id: deckId, name: 'Deutsch Daily', mod: now, usn: 0, lrnToday: [0,0], revToday: [0,0], newToday: [0,0], timeToday: [0,0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 10, extendRev: 50 }
  };
  const conf = {
    activeDecks: [1], addToCur: true, collapseTime: 1200, curDeck: 1,
    curModel: mid, dayLearnFirst: false, dueCounts: true, estTimes: true,
    newSpread: 0, nextPos: 1, schedVer: 2, sched2021: true, sortBackwards: false,
    sortType: "noteFld", timeLim: 0, creationOffset: -480
  };
  const dconf = {
    "1": { id: 1, name: "Default", replayq: true, lapse: { delays: [10, 60], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 }, rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 }, timer: 0, maxTaken: 60, new: { separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: true, order: 1 }, mod: 0, usn: 0, autoplay: true }
  };
  db.run(`INSERT INTO col VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    now, now, now * 1000, 0, 11, 0, 0, 0,
    JSON.stringify(conf), JSON.stringify(model), JSON.stringify(decks),
    JSON.stringify(dconf), '{}'
  ]);

  db.run(`CREATE TABLE notes(
    id integer primary key, guid text, mid integer, mod integer, usn integer,
    tags text, flds text, sfld text, csum integer, flags integer, data text)`);
  db.run(`CREATE TABLE cards(
    id integer primary key, nid integer, did integer, ord integer, mod integer,
    usn integer, type integer, queue integer, due integer, ivl integer,
    factor integer, reps integer, lapses integer, left integer, odue integer,
    odid integer, flags integer, data text)`);
  db.run(`CREATE TABLE revlog(
    id integer primary key, cid integer, usn integer, ease integer, ivl integer,
    lastIvl integer, factor integer, time integer, type integer)`);
  db.run(`CREATE TABLE graves(
    usn integer, oid integer, type integer)`);
  db.run(`CREATE INDEX ix_notes_usn on notes (usn)`);
  db.run(`CREATE INDEX ix_cards_usn on cards (usn)`);
  db.run(`CREATE INDEX ix_revlog_usn on revlog (usn)`);
  db.run(`CREATE INDEX ix_cards_nid on cards (nid)`);
  db.run(`CREATE INDEX ix_revlog_cid on revlog (cid)`);
  db.run(`CREATE INDEX ix_notes_csum on notes (csum)`);

  const enc = new TextEncoder();
  function csum(s) { // anki checquers field hash (java String.hashCode)
    let h = 0;
    for (const b of enc.encode(s)) { h = (31 * h + b) | 0; }
    return h;
  }
  function guid(key) {
    let h = 0; const s = 'dd-' + key;
    for (const b of enc.encode(s)) { h = (31 * h + b) | 0; }
    return 'dd' + (h >>> 0).toString(16);
  }

  let nid = now * 1000, cid = (now + 1) * 1000;
  for (const b of words) {
    const front = esc(b.word);
    const back = `${esc(b.zh)}${b.example ? `<br><i>${esc(b.example)}</i>` : ''}`;
    const sfld = front;
    const flds = front.replace(/\t/g, ' ') + '\x1f' + back.replace(/\t/g, ' ');
    db.run(`INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [nid, guid(b.key), mid, now, -1, ' dd::' + (b.date || 'manual') + ' ', flds, sfld, csum(sfld), 0, '']);
    db.run(`INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cid, nid, deckId, 0, now, -1, 0, 0, nid, 0, 0, 0, 0, 0, 0, 0, 0, '']);
    nid++; cid++;
  }

  status('打包…');
  const data = db.export();
  // zip: meta(version2) + collection.anki2 + collection.anki21(同内容, anki26+导入器优先读) + media
  const zip = makeZip({
    'meta': new Uint8Array([0x08, 0x02]),
    'collection.anki2': data,
    'collection.anki21': data,
    'media': new TextEncoder().encode('{}')
  });
  const blob = new Blob([zip], { type: 'application/apkg' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `deutsch-daily-${words.length}w-${Date.now()}.apkg`;
  a.click();
  return words.length;
}

/* 极简 zip (store, 无压缩) — apkg 只需合法 zip */
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  for (const [name, content] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const crc = crc32(content);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);       // version
    lh.setUint16(6, 0, true);        // flags
    lh.setUint16(8, 0, true);        // store
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x2821, true); // time/date(dos)
    lh.setUint32(14, crc, true);
    lh.setUint32(18, content.length, true);
    lh.setUint32(22, content.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, content);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x2821, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, content.length, true); ch.setUint32(24, content.length, true);
    ch.setUint16(28, nameB.length, true);
    // 30..45 = 0
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + content.length;
  }
  let centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, Object.keys(files).length, true);
  eocd.setUint16(10, Object.keys(files).length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  const total = [...chunks, ...central, new Uint8Array(eocd.buffer)];
  const out = new Uint8Array(total.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of total) { out.set(c, p); p += c.length; }
  return out;
}

export { exportApkg };

