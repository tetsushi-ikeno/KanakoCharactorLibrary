/* ==============================
   状態・ユーティリティ・定数
================================ */
let characters = [];
let filteredCharacters = [];
let currentIndex = 0;

let activeSeries  = 'all';
let keyword       = '';
let statusFilter  = null;   // null | 'wip' | 'done'
let adminSecret   = '';

let currentBgReqId = 0;     // 詳細背景の競合防止用
let ioCardBg = null;        // 一覧カードの遅延読込 IO

const $id = (id) => document.getElementById(id);
const PLACEHOLDER = '--調査中--';

/* 画像パス系（存在すれば上から順に使う） */
function imgSrcFor(id) { return `images/${id}.png`; }
function lqipSrc(id)    { return `images/lqip/bg_${id}_24.webp`; }
function bgCandidates(id) {
  return [
    `images/bg_${id}_1600.webp`,
    `images/bg_${id}_800.webp`,
    `images/bg_${id}_400.webp`,
    `images/bg${id}.png`,           // 既存フォールバック
  ];
}
function setFallbackOnError(imgEl) {
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = 'images/placeholder.png';
  };
}

/* 文字列ユーティリティ */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}
function withInvestigating(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? PLACEHOLDER : s;
}

/* カラー名→#RRGGBB 変換（編集UIで使用） */
function toHexColor(v){
  const s = (v||'').toString().trim();
  if(!s) return '';
  const d = document.createElement('div');
  d.style.color = s;
  document.body.appendChild(d);
  const m = getComputedStyle(d).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  document.body.removeChild(d);
  if(!m) return '';
  return '#'+[m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,'0')).join('').toUpperCase();
}

/* シリーズ表現の正規化 */
function asSeriesArray(c) {
  const s = c.series;
  if (Array.isArray(s)) return s;
  if (typeof s === 'string') {
    // 全角区切りやカンマも許容
    return s.split(/[,、\s]+/).map(t=>t.trim()).filter(Boolean);
  }
  return [];
}

/* 調査中フラグ判定 */
function isPending(c) {
  const p = c.profile || {};
  const vals = [
    p['住んでいるところ'],
    p['好きなもの・こと'],
    p['イメージカラー'],
    c.appearance,
    c.memo
  ];
  return vals.some(v => {
    const s = (v ?? '').toString().trim();
    return s === '' || s === PLACEHOLDER;
  });
}

/* 並び順：id（数値として昇順）→ name */
function sortCharacters(list) {
  const num = s => Number(String(s).replace(/\D+/g, '')) || 0;
  return [...list].sort((a,b) => {
    const na = num(a.id), nb = num(b.id);
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/* 簡易トースト */
function showToast(msg, type='ok'){
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      .toast{position:fixed;right:16px;top:16px;z-index:3000;display:flex;flex-direction:column;gap:8px}
      .toast-item{padding:10px 12px;border-radius:10px;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:14px;transition:.3s}
      .toast-ok{background:#16a34a}.toast-err{background:#ef4444}`;
    document.head.appendChild(style);
  }
  let root = document.querySelector('.toast');
  if(!root){ root=document.createElement('div'); root.className='toast'; document.body.appendChild(root); }
  const el = document.createElement('div');
  el.className = `toast-item toast-${type==='err'?'err':'ok'}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; }, 1600);
  setTimeout(()=>{ el.remove(); }, 2100);
}

/* ==============================
   データ取得/API（Vercel同居＋フォールバック）
================================ */
const API_BASE = location.origin;

async function fetchCharactersSafe(){
  const urls = [
    `${API_BASE}/api/characters`,
    `${API_BASE}/api/characters.js`
  ];
  for (const url of urls){
    try{
      const r = await fetch(url, { cache:'no-store' });
      if (r.ok) return await r.json();
    }catch(_e){}
  }
  throw new Error('characters API not available');
}

async function apiPatchCharacter(payload){
  const urls = [
    `${API_BASE}/api/characters`,
    `${API_BASE}/api/characters.js`
  ];
  let last = '';
  for (const url of urls){
    try{
      const res = await fetch(url, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify(payload)
      });
      if (res.ok) return res.json();
      last = await res.text().catch(()=> '');
    }catch(e){ last = String(e); }
  }
  throw new Error('PATCH failed: ' + (last||'unknown'));
}

async function reloadDataFresh(preserveId){
  try{
    const r = await fetch(`${API_BASE}/api/characters`, { cache:'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = await r.json();
    characters = Array.isArray(list) ? list : [];
    filteredCharacters = sortCharacters(characters);

    if (preserveId){
      const idx = filteredCharacters.findIndex(c => c.id === preserveId);
      if (idx >= 0) currentIndex = idx;
    }
    applyFilters();            // 再描画＋サマリー更新
  }catch(e){
    console.error(e);
    showToast('最新データの取得に失敗しました','err');
  }
}

/* ==============================
   起動
================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // 右下のビルドピル
  const build = document.querySelector('meta[name="app-build"]')?.content || 'dev';
  let pill = $id('version-pill');
  if (!pill){
    pill = document.createElement('div');
    pill.id = 'version-pill';
    pill.className = 'version-pill';
    document.body.appendChild(pill);
  }
  pill.textContent = `build: ${build}`;
  pill.title = 'クリックでこのビルド番号をクエリに付けて再読み込み';
  pill.style.cursor = 'pointer';
  pill.addEventListener('click', ()=>{
    const url = new URL(location.href);
    url.searchParams.set('b', build);
    location.href = url.toString();
  });

  setupCardLazyLoader();  // 一覧画像の遅延読み込みIOを準備
  wireHeaderHandlers();   // 入力やボタンのイベント結線

  // データ取得
  try{
    characters = await fetchCharactersSafe();
    filteredCharacters = sortCharacters(characters);
  }catch(e){
    console.error('API読み込み失敗:', e);
    alert('データ読み込みに失敗しました。/api/characters を確認してください。');
    return;
  }

  renderList(filteredCharacters);
  renderSummaryBar();

  // パレット読込（任意）
  loadPalettes().catch(console.error);
});

/* ==============================
   パレット（既存仕様のまま）
================================ */
async function loadPalettes(){
  try{
    const res = await fetch('data/palettes.json?v=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const palettes = await res.json();
    renderPaletteList(palettes);
    const savedKey = localStorage.getItem('theme.palette.key');
    const initial = palettes.find(p=>p.key===savedKey) || palettes[0];
    applyPalette(initial);
  }catch(e){
    console.error('パレット読み込み失敗:', e);
  }
}
function applyPalette(p){
  if (!p) return;
  const root=document.documentElement;
  root.style.setProperty('--base-color',   p.base);
  root.style.setProperty('--accent-color', p.accent);
  root.style.setProperty('--sub-color',    p.sub);
  localStorage.setItem('theme.palette.key', p.key);
}
function renderPaletteList(palettes){
  const panel=$id('palette-panel');
  if (!panel) return;
  panel.innerHTML='';
  palettes.forEach(p=>{
    const item=document.createElement('div');
    item.className='palette-item';
    item.innerHTML =
      `<div class="palette-name">${p.name}</div>
       <div class="palette-bars"
            style="--base-color:${p.base};--accent-color:${p.accent};--sub-color:${p.sub}">
         <span></span><span></span><span></span>
       </div>`;
    item.addEventListener('click', ()=>{
      applyPalette(p);
      panel.hidden = true;
    });
    panel.appendChild(item);
  });
  const btn=$id('palette-btn');
  if (btn){
    btn.onclick = (e)=>{ e.stopPropagation(); panel.hidden = !panel.hidden; };
    document.addEventListener('click', (e)=>{
      if(!panel.hidden && !panel.contains(e.target) && e.target!==btn) panel.hidden = true;
    });
  }
}
/* ==============================
   入力・ボタンのイベント結線
================================ */
function wireHeaderHandlers(){
  // 検索
  const search = $id('search-box');
  if (search && !search.dataset.bound){
    search.addEventListener('input', e => {
      keyword = (e.target.value||'').trim();
      applyFilters();
    });
    search.dataset.bound = '1';
  }

  // シリーズ（チップ）
  const sf = $id('series-filter');
  if (sf && !sf.dataset.bound){
    sf.addEventListener('click', e =>{
      const btn = e.target.closest('.chip'); if(!btn) return;
      const v = btn.dataset.series;
      if (v === 'investigating'){
        statusFilter = (statusFilter === 'wip') ? null : 'wip';
        renderSummaryBar();
      } else {
        activeSeries = v;
        [...sf.children].forEach(b=>b.classList.toggle('is-active', b===btn));
      }
      applyFilters();
    });
    sf.dataset.bound = '1';
  }

  // 調査中ピル（ヘッダー右）
  const pendingBtn = $id('pending-toggle');
  if (pendingBtn && !pendingBtn.dataset.bound){
    pendingBtn.addEventListener('click', ()=>{
      const pressed = pendingBtn.getAttribute('aria-pressed') === 'true';
      const next = !pressed;
      pendingBtn.setAttribute('aria-pressed', String(next));
      statusFilter = next ? 'wip' : null;
      applyFilters();
    });
    pendingBtn.dataset.bound = '1';
  }

  // 戻る/ナビ
  document.querySelector('.back-button')?.addEventListener('click', showList);
  document.querySelector('.nav-button.next')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex+1) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });
  document.querySelector('.nav-button.prev')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex-1+filteredCharacters.length) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });

  // 編集モード（パスワードモーダル）
  const editBtn  = $id('edit-btn');
  const modal    = $id('pw-modal');
  const pwInput  = $id('pw-input');
  const pwOk     = $id('pw-ok');
  const pwCancel = $id('pw-cancel');
  const pwError  = $id('pw-error');
  const backdrop = modal?.querySelector('.modal-backdrop');
  const panel    = modal?.querySelector('.modal-panel');

  function openPwModal(){
    if (!modal) return;
    pwError.hidden = true; pwInput.value = '';
    modal.hidden = false; modal.classList.add('show');
    setTimeout(()=>pwInput.focus(),0);
  }
  function closePwModal(){
    if (!modal) return;
    modal.classList.remove('show'); modal.hidden = true;
  }

  editBtn?.addEventListener('click', ()=>{
    if (isEditing){ exitEditMode(); return; }
    openPwModal();
  });
  backdrop?.addEventListener('click',      closePwModal);
  backdrop?.addEventListener('touchstart', closePwModal, {passive:true});
  panel?.addEventListener('click',      e=>e.stopPropagation());
  panel?.addEventListener('touchstart', e=>e.stopPropagation(), {passive:true});
  pwCancel?.addEventListener('click', closePwModal);
  pwOk?.addEventListener('click', ()=>{
    const v = pwInput.value.trim();
    if (!v){ pwError.hidden = false; pwError.textContent = 'パスワードを入力してください。'; return; }
    adminSecret = v; closePwModal(); enterEditMode();
  });
  pwInput?.addEventListener('keydown', e=>{
    if (e.key === 'Enter') $id('pw-ok').click();
    if (e.key === 'Escape') closePwModal();
  });

  // 編集保存/取消
  $id('edit-save')?.addEventListener('click', onSaveClick);
  $id('edit-cancel')?.addEventListener('click', ()=>{
    tempEdited=null; exitEditMode(); showDetail();
  });
}

/* ==============================
   一覧カードの遅延読込
================================ */
function setupCardLazyLoader(){
  if (ioCardBg) return;
  ioCardBg = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (src){
        img.src = src;
        img.removeAttribute('data-src');
      }
      ioCardBg.unobserve(img);
    });
  }, { rootMargin: '300px 0px' });
}

/* ==============================
   一覧描画
================================ */
function renderList(list){
  const wrap = $id('card-list');
  if (!wrap) return;

  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<p style="padding:24px;color:#555">該当するキャラがいません</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((c, idx)=>{
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.setAttribute('aria-label', `${c.id}. ${c.name}`);
    card.addEventListener('click', ()=>{
      currentIndex = idx;
      showDetail();
    });

    // 画像（遅延）
    const img = document.createElement('img');
    img.className = 'card-img';
    img.alt = c.name || '';
    img.setAttribute('loading', 'lazy');
    img.dataset.src = imgSrcFor(c.id);
    setFallbackOnError(img);
    if (ioCardBg) ioCardBg.observe(img);

    // キャプション
    const cap = document.createElement('div');
    cap.className = 'card-caption';
    cap.innerHTML = `<span class="card-id">${c.id}</span> <span class="card-name">${escapeHtml(c.name || '')}</span>`;

    card.appendChild(img);
    card.appendChild(cap);
    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}

/* ==============================
   フィルタリング＋再描画
================================ */
function applyFilters(){
  const kw = keyword.toLowerCase();
  const isAll = (activeSeries === 'all');

  filteredCharacters = sortCharacters(
    characters.filter(c => {
      // シリーズ
      if (!isAll) {
        const seriesArr = asSeriesArray(c);
        if (!seriesArr.includes(activeSeries)) return false;
      }
      // 状態
      if (statusFilter === 'wip'  && !isPending(c)) return false;
      if (statusFilter === 'done' &&  isPending(c)) return false;

      // キーワード
      if (kw) {
        const p = c.profile || {};
        const text = [
          c.id, c.name,
          ...(asSeriesArray(c)),
          p['住んでいるところ'] || '',
          p['好きなもの・こと']  || '',
          p['イメージカラー']    || '',
          c.appearance || '',
          c.memo || ''
        ].join(' ').toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    })
  );

  renderList(filteredCharacters);
  renderSummaryBar();
}

/* ==============================
   サマリー（進捗・ピル）
================================ */
function renderSummaryBar(){
  const total = characters.length;
  const done  = characters.filter(c => !isPending(c)).length;
  const wip   = total - done;

  // テキスト
  $id('sum-txt-total') && ($id('sum-txt-total').textContent = String(total));
  $id('sum-txt-done')  && ($id('sum-txt-done').textContent  = String(done));
  $id('sum-txt-wip')   && ($id('sum-txt-wip').textContent   = String(wip));
  $id('sum-txt-rate')  && ($id('sum-txt-rate').textContent  =
    total ? Math.round((done/total)*100) + '%' : '0%');

  // バー
  const doneRate = total ? (done/total*100) : 0;
  const wipRate  = total ? (wip /total*100) : 0;
  $id('sum-bar-done') && ($id('sum-bar-done').style.width = `${doneRate}%`);
  $id('sum-bar-wip')  && ($id('sum-bar-wip').style.width  = `${wipRate}%`);

  // カウントバッジ
  $id('sum-count-done') && ($id('sum-count-done').textContent = String(done));
  $id('sum-count-wip')  && ($id('sum-count-wip').textContent  = String(wip));

  // ピルのクリック（トグル）
  const pillDone = $id('sum-pill-done');
  const pillWip  = $id('sum-pill-wip');

  pillDone?.setAttribute('aria-pressed', String(statusFilter === 'done'));
  pillWip ?.setAttribute('aria-pressed', String(statusFilter === 'wip'));

  pillDone && (pillDone.onclick = ()=>{
    statusFilter = (statusFilter === 'done') ? null : 'done';
    applyFilters();
  });
  pillWip  && (pillWip.onclick  = ()=>{
    statusFilter = (statusFilter === 'wip') ? null : 'wip';
    applyFilters();
  });

  // クリア
  const clear = $id('sum-clear');
  if (clear){
    clear.hidden = !statusFilter && activeSeries === 'all' && !keyword;
    clear.onclick = ()=>{
      statusFilter = null; activeSeries = 'all'; keyword = '';
      const sf = $id('series-filter');
      if (sf) [...sf.children].forEach(b => b.classList.toggle('is-active', b.dataset.series === 'all'));
      $id('search-box') && ($id('search-box').value='');
      applyFilters();
    };
  }
}
/* ==============================
   詳細ビュー切替＆描画
================================ */
function showList(){
  $id('detail-view')?.classList.add('hidden');
  $id('list-view')?.classList.remove('hidden');
  // スクロール位置が飛ばないように任意で調整してOK
}

function showDetail(){
  if (!filteredCharacters.length) return;
  $id('list-view')?.classList.add('hidden');
  $id('detail-view')?.classList.remove('hidden');
  loadCharacter(currentIndex);
}

function loadCharacter(index){
  const c = filteredCharacters[index];
  if (!c) return;

  // ヒーロー画像
  const hero = $id('detail-img');
  if (hero){
    hero.src = imgSrcFor(c.id);
    hero.alt = c.name || '';
    setFallbackOnError(hero);
  }

  // 概要
  const summary = $id('character-summary');
  if (summary){
    const series = asSeriesArray(c).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    summary.className = 'panel summary';
    summary.innerHTML = `
      <p class="no">No.${escapeHtml(c.id)}</p>
      <h2 class="name">${escapeHtml(c.name||'')}</h2>
      <div class="series">シリーズ：${series || '<span class="tag">—</span>'}</div>
    `;
  }

  // プロフィール
  const p = c.profile || {};
  $id('profile').innerHTML = `
    <h3>プロフィール</h3>
    <div>住んでいるところ：${escapeHtml(p['住んでいるところ'] || PLACEHOLDER)}</div>
    <div>好きなもの・こと：${escapeHtml(p['好きなもの・こと']  || PLACEHOLDER)}</div>
    <div>イメージカラー：<span class="color-dot" style="background:${escapeHtml(p['イメージカラー']||'transparent')}"></span></div>
  `;

  // 見た目/メモ
  $id('appearance').innerHTML = `<h3>見た目</h3><div>${escapeHtml(c.appearance || PLACEHOLDER)}</div>`;
  $id('memo').innerHTML       = `<h3>メモ</h3><div>${escapeHtml(c.memo || PLACEHOLDER)}</div>`;

  // 背景読み込み（LQIP→候補順に本番）
  loadDetailBackground(c.id);
}

/* 背景の競合を抑止しつつ読込 */
async function loadDetailBackground(id){
  const reqId = ++currentBgReqId;
  const bg = $id('detail-bg');
  if (!bg) return;

  // まずLQIP（低解像）
  bg.src = lqipSrc(id);
  bg.style.filter = 'blur(8px)';
  bg.style.transform = 'scale(1.02)';

  // 候補を順に試す
  for (const url of bgCandidates(id)){
    try{
      const ok = await tryPreload(url);
      if (!ok) continue;
      if (reqId !== currentBgReqId) return; // 競合で破棄
      bg.onload = ()=>{
        bg.style.filter = '';
        bg.style.transform = '';
      };
      bg.src = url;
      return;
    }catch(_e){}
  }
  // どれも失敗ならフォールバック
  if (reqId === currentBgReqId) {
    bg.src = 'images/placeholder.png';
    bg.style.filter = '';
    bg.style.transform = '';
  }
}
function tryPreload(url){
  return new Promise(resolve=>{
    const i = new Image();
    i.onload  = ()=> resolve(true);
    i.onerror = ()=> resolve(false);
    i.src = url;
  });
}

/* ==============================
   編集モード（既存ロジック整理）
================================ */
let isEditing = false;
let tempEdited = null;   // 編集ワーク

function enterEditMode(){
  if (!filteredCharacters.length) return;
  isEditing = true;
  document.body.classList.add('is-editing');

  if ($id('detail-view').classList.contains('hidden')) {
    showDetail();
  }
  tempEdited = JSON.parse(JSON.stringify(filteredCharacters[currentIndex]));
  renderEditableFields();

  const btn = $id('edit-btn');
  if (btn) btn.textContent = '編集終了';
  $id('edit-actions').hidden = false;
  refreshSaveState();
}
function exitEditMode(){
  isEditing = false;
  document.body.classList.remove('is-editing');
  tempEdited = null;

  // 再読込して非編集に戻す
  if (!$id('detail-view').classList.contains('hidden')) loadCharacter(currentIndex);

  const btn = $id('edit-btn');
  if (btn) btn.textContent = '✎';
  $id('edit-actions').hidden = true;
}

/* カラー候補（24色＋空） */
const COLOR_24 = [
  ['', '— Select color —', ''],
  ['#000000','black','黒'],['#808080','gray','グレー'],['#FFFFFF','white','白'],
  ['#FF0000','red','赤'],['#FF7F00','orange','オレンジ'],['#FFFF00','yellow','黄'],
  ['#9ACD32','yellowgreen','黄緑'],['#00FF00','lime','ライム'],['#008000','green','緑'],
  ['#00FFFF','cyan','シアン'],['#00CED1','darkturquoise','ターコイズ'],['#40E0D0','turquoise','エメラルド'],
  ['#87CEEB','skyblue','スカイブルー'],['#0000FF','blue','青'],['#000080','navy','ネイビー'],
  ['#4B0082','indigo','インディゴ'],['#800080','purple','紫'],['#8A2BE2','blueviolet','ブルーバイオレット'],
  ['#FF00FF','magenta','マゼンタ'],['#FF69B4','pink','ピンク'],
  ['#A52A2A','brown','茶'],['#8B4513','saddlebrown','濃い茶'],
  ['#FFD700','gold','ゴールド'],['#F5DEB3','wheat','小麦色'],
];

function colorLabel(hex){
  if(!hex) return '';
  const hit = COLOR_24.find(([h]) => h.toUpperCase() === hex.toUpperCase());
  return hit ? `${hit[1]}${hit[2] ? ` / ${hit[2]}` : ''}` : '';
}

/* 編集フィールド一式 */
function renderEditableFields(){
  const data = tempEdited || filteredCharacters[currentIndex] || {};
  const allSeries = Array.from(new Set(characters.flatMap(c=>asSeriesArray(c)))).filter(Boolean);
  if (!Array.isArray(data.series)) data.series = asSeriesArray(data);

  // サマリ（タイトル＋シリーズタグ編集）
  const summary = $id('character-summary');
  summary.innerHTML = `
    <p>No.${data.id}</p>
    <h2>${escapeHtml(data.name || '')}</h2>
    <label>シリーズ：</label>
    <div class="tags" id="series-tags"></div>
    <div class="tag-input">
      <input id="series-input" list="series-datalist" placeholder="シリーズを追加（Enter）" />
      <datalist id="series-datalist">
        ${allSeries.map(s=>`<option value="${escapeHtml(s)}">`).join('')}
      </datalist>
    </div>
    <div id="series-error" class="field-error" style="display:none;">シリーズを1つ以上選んでください。</div>
  `;

  function renderSeriesTags(){
    const wrap = $id('series-tags');
    wrap.innerHTML = '';
    (data.series||[]).forEach(s=>{
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${escapeHtml(s)}<span class="remove" title="削除">✕</span>`;
      el.querySelector('.remove').onclick = ()=>{
        data.series = data.series.filter(x=>x!==s);
        renderSeriesTags();
        refreshSaveState();
      };
      wrap.appendChild(el);
    });
  }
  renderSeriesTags();

  const seriesInput = $id('series-input');
  seriesInput.addEventListener('keydown', (e)=>{
    if (e.key==='Enter'){
      const v = seriesInput.value.trim();
      if (v && !data.series.includes(v)){
        data.series.push(v);
        renderSeriesTags();
        seriesInput.value='';
        refreshSaveState();
      }
      e.preventDefault();
    }
  });

  data.profile ||= {};
  const nowHex = toHexColor(data.profile['イメージカラー']);

  const options = COLOR_24.map(([hex,en,ja])=>{
    const sel  = (hex && nowHex && hex.toUpperCase()===nowHex) ? ' selected' : '';
    const text = en + (ja ? ` / ${ja}` : '');
    return `<option value="${hex}"${sel}>${text}</option>`;
  }).join('');

  $id('profile').innerHTML = `
    <h3>プロフィール</h3>
    <label>住んでいるところ：
      <input id="edit-home" class="edit-field" value="${escapeHtml(data.profile['住んでいるところ']||'')}">
    </label><br><br>
    <label>好きなもの・こと：
      <input id="edit-like" class="edit-field" value="${escapeHtml(data.profile['好きなもの・こと']||'')}">
    </label><br><br>
    <label class="color-row">イメージカラー：
      <select id="edit-color" class="edit-field select">${options}</select>
      <span class="color-dot" id="edit-color-dot" style="background:${nowHex || 'transparent'}"></span>
      <span class="color-text" id="edit-color-text">${colorLabel(nowHex||'')}</span>
    </label>
  `;

  $id('edit-home') ?.addEventListener('input', e=>{ data.profile['住んでいるところ'] = e.target.value; refreshSaveState(); });
  $id('edit-like') ?.addEventListener('input', e=>{ data.profile['好きなもの・こと'] = e.target.value; refreshSaveState(); });
  $id('edit-color')?.addEventListener('change', e=>{
    const hex = e.target.value;
    data.profile['イメージカラー'] = hex || '';
    const dot  = $id('edit-color-dot');  if (dot)  dot.style.background = hex || 'transparent';
    const text = $id('edit-color-text'); if (text) text.textContent     = colorLabel(hex||'');
    refreshSaveState();
  });

  $id('appearance').innerHTML =
    `<h3>見た目</h3>
     <textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>`;
  $id('memo').innerHTML =
    `<h3>メモ</h3>
     <textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>`;

  $id('edit-appearance')?.addEventListener('input', e=>{ data.appearance = e.target.value; refreshSaveState(); });
  $id('edit-memo')      ?.addEventListener('input', e=>{ data.memo       = e.target.value;   refreshSaveState(); });
}

/* 入力妥当性 */
function validateEdited(data){
  const errors = {};
  if ((data.appearance||'').length > 1000) errors.appearance = '1000文字以内で入力してください。';
  if ((data.memo||'').length       > 1000) errors.memo       = '1000文字以内で入力してください。';

  // 表示だけ整える（赤枠など）
  const appTa  = $id('edit-appearance');
  const memoTa = $id('edit-memo');
  appTa  && appTa .classList.toggle('invalid', !!errors.appearance);
  memoTa && memoTa.classList.toggle('invalid', !!errors.memo);

  return { ok: Object.keys(errors).length===0, errors };
}
function refreshSaveState(){
  const saveBtn = $id('edit-save');
  if(!saveBtn || !tempEdited) return;
  const { ok } = validateEdited(tempEdited);
  saveBtn.disabled = !ok;
}

/* 保存 */
async function onSaveClick(){
  if(!tempEdited) return;

  const { ok } = validateEdited(tempEdited);
  if(!ok){
    alert('未入力や不正な入力があります。赤枠をご確認ください。');
    return;
  }

  const btn  = $id('edit-save');
  const prev = btn.textContent;
  btn.disabled = true;
  btn.setAttribute('aria-busy','true');
  btn.textContent = '保存中…';

  const p = tempEdited.profile || {};
  const payload = {
    id: tempEdited.id,
    series: Array.isArray(tempEdited.series) ? tempEdited.series : asSeriesArray(tempEdited),
