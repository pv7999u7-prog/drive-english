// 開車英文：讀 Google 試算表單字本（Claude 對話結束時寫入），在手機上複習
const KEY = 'drive-en-v2';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let S = { sheetId: '', rate: 0.85, recentN: 100, done: {}, cache: [], cacheAt: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

// 用 ?sheet=ID 開一次就記住
const qs = new URLSearchParams(location.search);
if (qs.get('sheet')) S.sheetId = qs.get('sheet').trim();
if (/^https:\/\/claude\.ai\/project\/[\w-]+$/.test(qs.get('proj') || '')) S.projUrl = qs.get('proj');
if (qs.get('sheet') || qs.get('proj')) { save(); history.replaceState(null, '', location.pathname); }

const today = () => new Date().toLocaleDateString('sv-SE');
const keyOf = it => it.en.toLowerCase();

// ---------- 讀試算表 ----------
function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function load() {
  if (!S.sheetId) { render(); return; }
  $('#stat').textContent = '讀取中…';
  try {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(S.sheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent('單字')}&t=${Date.now()}`;
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok || txt.trimStart().startsWith('<')) throw new Error('讀不到試算表（請確認已設成「知道連結的人可以檢視」）');
    const rows = parseCSV(txt).slice(1);
    S.cache = rows.map((c, i) => ({ row: i + 2, date: (c[0] || '').trim(), en: (c[1] || '').trim(), zh: (c[2] || '').trim(), ex: (c[3] || '').trim(), exZh: (c[4] || '').trim(), kind: (c[5] || '單字').trim(), src: (c[6] || '').trim() }))
      .filter(it => it.en);
    S.cacheAt = Date.now(); save();
    render();
  } catch (e) {
    render();
    $('#stat').textContent = '⚠️ ' + e.message + (S.cache.length ? '（顯示上次的資料）' : '');
  }
}

// 新的在前
const items = () => S.cache.slice().reverse();

// ---------- 畫面 ----------
// showEx=false：單字頁只顯示單字和中文；其他頁連例句一起顯示
function itemHTML(it, showEx = true) {
  const k = keyOf(it), done = !!S.done[k];
  const sent = it.kind === '句子';
  return `<div class="item ${sent ? 'sent' : ''} ${done ? 'done' : ''}">
    <input type="checkbox" data-k="${esc(k)}" ${done ? 'checked' : ''}>
    <div class="main"><div class="w">${esc(it.en)}${it.from ? `<span class="pill">${esc(it.from)}</span>` : ''}</div>
      <div class="m">${esc(it.zh)}</div>
      ${showEx && it.ex ? `<div class="s">${esc(it.ex)}${it.exZh ? '<br>' + esc(it.exZh) : ''}</div>` : ''}</div>
    <button class="say" data-say="${esc(it.en)}">🔊</button></div>`;
}

// 句子頁：Claude 教的句子＋單字的例句（例句當成一句來複習）
function sentences() {
  const out = [];
  for (const it of items()) {
    if (it.kind === '句子') out.push(it);
    else if (it.ex) out.push({ date: it.date, en: it.ex, zh: it.exZh, ex: '', exZh: '', kind: '句子', from: it.en });
  }
  return out;
}

let flt = 'all';
function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  let arr = flt === '句子' ? sentences() : items();
  if (flt === 'todo') arr = arr.filter(it => !S.done[keyOf(it)]);
  else if (flt === '單字') arr = arr.filter(it => it.kind !== '句子');
  if (q) arr = arr.filter(it => (it.en + it.zh + it.ex + it.exZh).toLowerCase().includes(q));
  let html = '', last = '';
  for (const it of arr) {
    if (it.date !== last) { html += `<div class="day">${esc(it.date || '未標日期')}</div>`; last = it.date; }
    html += itemHTML(it, flt !== '單字');
  }
  $('#list').innerHTML = html || '<p class="dim">沒有資料</p>';
}

function render() {
  const all = S.cache;
  const words = all.filter(it => it.kind !== '句子').length;
  const doneN = all.filter(it => S.done[keyOf(it)]).length;
  $('#stat').textContent = S.sheetId
    ? `共 ${words} 個單字、${all.length - words} 個句子，已複習 ${doneN}` + (S.cacheAt ? `（${new Date(S.cacheAt).toLocaleString('zh-TW', { hour12: false })} 更新）` : '')
    : '請先到 ⚙️ 設定填試算表 ID';
  const t = items().filter(it => it.date === today());
  $('#today').innerHTML = t.length ? t.map(it => itemHTML(it)).join('') : '<p class="dim" style="margin:0">今天還沒有新單字。練完說「結束」，Claude 存好後到 📖 單字本往下拉更新。</p>';
  renderList();
  if ($('#p-card').classList.contains('on')) nextCard(true);
}

// ---------- 抽卡 ----------
let cardFlt = 'todo', card = null;
function cardPool() {
  const arr = items();
  if (cardFlt === 'recent') return arr.filter(it => it.kind !== '句子').slice(0, S.recentN);
  if (cardFlt === 'todo') return arr.filter(it => !S.done[keyOf(it)]);
  return arr;
}
function nextCard(keep) {
  const pool = cardPool();
  $('#fCount').textContent = `這一組還有 ${pool.length} 張`;
  if (!pool.length) { card = null; $('#fW').textContent = '🎉 全部複習完了'; $('#fHint').style.display = 'none'; $('#fBack').style.display = 'none'; return; }
  if (!(keep && card && pool.includes(card))) {
    let n; do { n = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && n === card);
    card = n;
  }
  $('#fW').textContent = card.en;
  $('#fM').textContent = card.zh;
  $('#fS').innerHTML = card.ex ? esc(card.ex) + (card.exZh ? '<br>' + esc(card.exZh) : '') : '';
  $('#fHint').style.display = '';
  $('#fBack').style.display = 'none';
}
$('#flash').onclick = () => { if (!card) return; $('#fBack').style.display = 'block'; $('#fHint').style.display = 'none'; };
$('#fSay').onclick = () => card && speak(card.en);
$('#fNo').onclick = () => nextCard();
$('#fYes').onclick = () => { if (card) { S.done[keyOf(card)] = Date.now(); save(); } nextCard(); render(); };
$('#cardFlt').onclick = e => { const b = e.target.closest('button'); if (!b) return; cardFlt = b.dataset.v; [...$('#cardFlt').children].forEach(x => x.classList.toggle('on', x === b)); nextCard(); };

// ---------- 朗讀 ----------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  voice = vs.find(v => v.lang === 'en-US' && /Samantha|Premium|Enhanced/.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
// iPhone 開靜音時 speechSynthesis 會沒聲音，所以先用音檔播放（媒體聲音不受靜音開關影響），失敗才退回系統朗讀
// Safari 17 起可以把聲音類別設成 playback，靜音開關就不會擋住網頁聲音
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
const player = new Audio();
player.preload = 'auto';
function toast(t) {
  $('#toast').textContent = t; $('#toast').style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => $('#toast').style.display = 'none', 4000);
}
function sayLog(t) { const el = $('#sayLog'); if (el) el.textContent = t; }
function speak(t) {
  let fell = false;
  const fallback = why => {
    if (fell) return; fell = true;
    sayLog('音檔失敗（' + why + '），改用系統語音；系統語音在靜音模式下不會出聲');
    toast('🔇 音檔播放失敗（' + why + '），改用系統語音。若沒聲音請關掉靜音');
    speakSys(t);
  };
  player.pause();
  player.onerror = () => fallback('載入錯誤 ' + (player.error ? player.error.code : ''));
  player.onplaying = () => sayLog('音檔播放中 ✓');
  player.src = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&ttsspeed=${S.rate}&q=${encodeURIComponent(t.slice(0, 200))}`;
  const p = player.play();
  if (p) p.catch(e => fallback(e.name || '無法播放'));
}

// iOS Safari：cancel() 後馬上 speak() 常常沒聲音，所以只有正在念時才 cancel，並稍等一下再念
function speakSys(t) {
  if (!('speechSynthesis' in window)) return;
  if (!voice) pickVoice();
  const go = () => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US'; u.rate = S.rate; u.volume = 1; if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    speechSynthesis.resume();
  };
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 120); }
  else go();
}

// ---------- 事件 ----------
document.addEventListener('click', e => {
  const s = e.target.closest('[data-say]'); if (s) { speak(s.dataset.say); return; }
});

// 單字本頁：拉到最上面再往下拉就更新
let pullY = null, pullD = 0;
document.addEventListener('touchstart', e => {
  pullY = $('#p-list').classList.contains('on') && scrollY <= 0 ? e.touches[0].clientY : null; pullD = 0;
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (pullY === null) return;
  pullD = e.touches[0].clientY - pullY;
  if (pullD <= 0) { $('#ptr').style.height = '0'; return; }
  $('#ptr').style.height = Math.min(pullD / 2, 48) + 'px';
  $('#ptr').style.lineHeight = '48px';
  $('#ptr').textContent = pullD > 110 ? '↻ 放開就更新' : '↓ 往下拉更新';
}, { passive: true });
document.addEventListener('touchend', async () => {
  if (pullY === null) return;
  pullY = null;
  if (pullD > 110) {
    $('#ptr').style.height = '48px'; $('#ptr').textContent = '更新中…';
    await load();
  }
  $('#ptr').style.height = '0';
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.k; if (k === undefined) return;
  if (e.target.checked) S.done[k] = Date.now(); else delete S.done[k];
  save(); render();
});
$('#flt').onclick = e => { const b = e.target.closest('button'); if (!b) return; flt = b.dataset.v; [...$('#flt').children].forEach(x => x.classList.toggle('on', x === b)); renderList(); };
$('#q').oninput = renderList;
$('#btnRefresh').onclick = load;

document.querySelector('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + b.dataset.p));
  document.body.classList.toggle('home', b.dataset.p === 'home');
  if (b.dataset.p === 'card') nextCard(true);
  scrollTo(0, 0);
};

// 設定
$('#sheetId').value = S.sheetId;
$('#sheetId').onchange = () => {
  let v = $('#sheetId').value.trim();
  const m = v.match(/\/d\/([\w-]+)/); if (m) v = m[1];
  S.sheetId = v; $('#sheetId').value = v; save(); showInstr(); load();
};
function setOpenLink() {
  const ok = /^https:\/\/claude\.ai\/project\/[\w-]+/.test(S.projUrl || '');
  $('#openClaude').href = ok ? S.projUrl : 'https://claude.ai/';
  $('#openClaude').textContent = ok ? '▶ 開啟 Claude 專案' : '▶ 開啟 Claude';
  $('#openHint').textContent = (ok ? '進專案後 → 開新對話 → 按語音模式。' : '進「開車英文」專案 → 開新對話 → 按語音模式。') + '說「stop」或「結束」，Claude 會自動把單字存進單字本。';
}
// 全螢幕模式點 https 連結只會在 App 內開網頁版，所以先用 claude:// 叫起 Claude App；沒反應再退回網頁
$('#openClaude').onclick = e => {
  e.preventDefault();
  const web = $('#openClaude').href;
  const path = web.replace('https://claude.ai/', '');
  let left = false;
  const onHide = () => { left = true; };
  document.addEventListener('visibilitychange', onHide, { once: true });
  location.href = 'claude://' + path;
  setTimeout(() => { if (!left && document.visibilityState === 'visible') location.href = web; }, 1800);
};
$('#projUrl').value = S.projUrl || '';
$('#projUrl').onchange = () => {
  const m = $('#projUrl').value.match(/https:\/\/claude\.ai\/project\/[\w-]+/);
  S.projUrl = m ? m[0] : ''; $('#projUrl').value = S.projUrl; save(); setOpenLink();
};
setOpenLink();
$('#rate').value = S.rate; $('#rateVal').textContent = S.rate;
$('#rate').oninput = () => { S.rate = +$('#rate').value; $('#rateVal').textContent = S.rate; save(); };
$('#rate').onchange = () => speak('This is how fast I will read.');
$('#btnTestSay').onclick = () => { sayLog('播放中…'); speak('Hello! This is a sound test.'); };

function showRecentN() { $('#recentN').value = S.recentN; $('#recentBtn').textContent = `最近 ${S.recentN}`; }
showRecentN();
$('#recentN').onchange = () => {
  const n = Math.round(+$('#recentN').value);
  S.recentN = n >= 10 && n <= 1000 ? n : 100; save(); showRecentN(); showInstr();
};

let instrTpl = '';
function showInstr() { $('#instr').textContent = instrTpl.replace('{{SHEET_ID}}', S.sheetId || '（先填上面的試算表 ID）').replace('{{N}}', S.recentN); }
fetch('claude-project-instructions.md').then(r => r.text()).then(t => { instrTpl = t; showInstr(); }).catch(() => {});
$('#btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#instr').textContent); $('#btnCopy').textContent = '✅ 已複製'; }
  catch (e) { $('#btnCopy').textContent = '複製失敗，請長按下面文字自己選取'; }
  setTimeout(() => $('#btnCopy').textContent = '📋 複製專案指示', 2000);
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
$('#ver').textContent = '版本 v11' + (navigator.audioSession ? '（支援 audioSession）' : '');
render();
load();
