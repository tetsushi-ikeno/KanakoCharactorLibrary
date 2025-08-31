/* ===============================
   State / helpers
================================ */
let characters = [];
let filteredCharacters = [];
let currentIndex = 0;

let activeSeries = 'all';
let keyword      = '';
let statusFilter = null;   // null | 'wip' | 'done'
let isEditing    = false;
let adminSecret  = '';

let currentBgReqId = 0;
let ioCardBg = null;

const $id = (id) => document.getElementById(id);
const PLACEHOLDER = '--調査中--';

function imgSrcFor(id){ return `images/${id}.png`; }
function lqipSrc(id){   return `images/lqip/bg_${id}_24.webp`; }
function bgThumb(id){   return `images/bg_${id}_400.webp`; }
function bgCandidates(id){
  return [
    `images/bg_${id}_1600.webp`,
    `images/bg_${id}_800.webp`,
    `images/bg_${id}_400.webp`,
    `images/bg${id}.png`,
  ];
}
function setFallbackOnError(imgEl){
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = 'images/placeholder.png';
  };
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}
function asSeriesArray(c){
  const s = c.series;
  if (Array.isArray(s)) return s;
  if (typeof s === 'string') return s.split(/[,、\s]+/).map(t=>t.trim()).filter(Boolean);
  return [];
}
function isPending(c){
  const p = c.profile || {};
  const vals = [ p['住んでいるところ'], p['好きなもの・こと'], p['イメージカラー'], c.appearance, c.memo ];
  return vals.some(v => (v ?? '').toString().trim() === '' || (v ?? '') === PLACEHOLDER);
}
function sortCharacters(list){
  const num = s => Number(String(s).replace(/\D+/g, '')) || 0;
  return [...list].sort((a,b)=>{
    const na=num(a.id), nb=num(b.id);
    return (na!==nb) ? na-nb : (a.name||'').localeCompare(b.name||'');
  });
}
function toHexColor(v){
  const s = (v||'').toString().trim(); if(!s) return '';
  const d = document.createElement('div'); d.style.color = s; document.body.appendChild(d);
  const m = getComputedStyle(d).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  document.body.removeChild(d);
  if(!m) return '';
  return '#'+[m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function withInvestigating(v){ const s=(v??'').toString().trim(); return s===''?PLACEHOLDER:s; }

/* ===============================
   API
================================ */
const API_BASE = location.origin;

async function fetchCharacters(){
  const r = await fetch(`${API_BASE}/api/characters`, { cache:'no-store' });
  if(!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
async function apiPatchCharacter(payload){
  const r = await fetch(`${API_BASE}/api/characters`, {
    method:'PATCH',
    headers:{ 'Content-Type':'application/json', 'X-Admin-Secret': adminSecret },
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`PATCH ${r.status} ${await r.text().catch(()=> '')}`);
  return r.json();
}
async function reloadDataFresh(preserveId){
  try{
    characters = await fetchCharacters();
    filteredCharacters = sortCharacters(characters);
    if (preserveId){
      const i = filteredCharacters.findIndex(c=>c.id===preserveId);
      if (i>=0) currentIndex = i;
    }
    applyFilters();
  }catch(e){
    console.error(e);
    showToast('最新データの取得に失敗しました','err');
  }
}

/* ===============================
   Boot
================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // 右下のビルド表示
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
  pill.addEventListener('click', ()=>{
    const url = new URL(location.href);
    url.searchParams.set('b', build);
    location.href = url.toString();
  });

  // 一覧モードで開始
  document.body.classList.add('mode-list');

  setupCardLazyLoader();
  wireHeaderHandlers();
    // 詳細ヒーローでキャラクリック→フルスクリーン
  $id('detail-img')?.addEventListener('click', ()=>{
    const c = filteredCharacters[currentIndex];
    if (c) openFullScreen(c.id, c.name);
  });
  // モーダルの閉じる操作
  $id('fs-close')?.addEventListener('click', closeFullScreen);
  $id('fs-modal')?.addEventListener('click', (e)=>{
    if (e.target.classList.contains('fs-backdrop')) closeFullScreen();
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && !$id('fs-modal').hidden) closeFullScreen();
  });

  try{
    characters = await fetchCharacters();
    filteredCharacters = sortCharacters(characters);
  }catch(e){
    alert('データ読み込みに失敗しました。/api/characters を確認してください。');
    return;
  }

  renderList(filteredCharacters);
  renderSummaryBar();
  loadPalettes().catch(console.error);
});

/* ===============================
   Header / Controls
================================ */
function wireHeaderHandlers(){
  // 検索
  const search = $id('search-box');
  search?.addEventListener('input', e=>{
    keyword = (e.target.value||'').trim();
    applyFilters();
  });

  // シリーズ（チップ）
  const sf = $id('series-filter');
  sf?.addEventListener('click', e=>{
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

  // 詳細ナビ
  document.querySelector('.back-button')?.addEventListener('click', showList);
  document.querySelector('.nav-button.next')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex+1) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });
  document.querySelector('.nav-button.prev')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex-1+filteredCharacters.length) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });

  // 編集モーダル
  const editBtn  = $id('edit-btn');
  const modal    = $id('pw-modal');
  const pwInput  = $id('pw-input');
  const pwOk     = $id('pw-ok');
  const pwCancel = $id('pw-cancel');
  const pwError  = $id('pw-error');
  const backdrop = modal?.querySelector('.modal-backdrop');
  const panel    = modal?.querySelector('.modal-panel');

  function openPw(){
    if (!modal) return;
    pwError.hidden = true; pwInput.value = '';
    modal.hidden = false; modal.classList.add('show');
    setTimeout(()=>pwInput.focus(),0);
  }
  function closePw(){
    if (!modal) return;
    modal.classList.remove('show'); modal.hidden = true;
  }

  editBtn?.addEventListener('click', ()=>{
    if (isEditing){ exitEditMode(); return; }
    openPw();
  });
  backdrop?.addEventListener('click', closePw);
  panel?.addEventListener('click', e=>e.stopPropagation());
  pwCancel?.addEventListener('click', closePw);
  pwOk?.addEventListener('click', ()=>{
    const v = pwInput.value.trim();
    if (!v){ pwError.hidden=false; pwError.textContent='パスワードを入力してください。'; return; }
    adminSecret = v; closePw(); enterEditMode();
  });
  pwInput?.addEventListener('keydown', e=>{
    if (e.key==='Enter') $id('pw-ok').click();
    if (e.key==='Escape') closePw();
  });

  // 保存/取消
  $id('edit-save')?.addEventListener('click', onSaveClick);
  $id('edit-cancel')?.addEventListener('click', ()=>{
    tempEdited=null; exitEditMode(); showDetail();
  });
}

/* ===============================
   List view
================================ */
function setupCardLazyLoader(){
  if (ioCardBg) return;
  ioCardBg = new IntersectionObserver((entries)=>{
    entries.forEach(ent=>{
      if (!ent.isIntersecting) return;
      const img = ent.target;
      const src = img.dataset.src;
      if (src){ img.src = src; img.removeAttribute('data-src'); }
      ioCardBg.unobserve(img);
    });
  }, { rootMargin: '300px 0px' });
}

function renderList(list){
  const wrap = $id('card-list');
  if (!wrap) return;

  wrap.innerHTML = '';
  if (!list.length){
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

    // 4:3のメディア枠に画像をまとめる
    const media = document.createElement('div');
    media.className = 'card-media';

    // 背景サムネ（遅延）
    const bg = document.createElement('img');
    bg.className = 'card-bg';
    bg.alt = '';
    bg.loading = 'lazy';
    bg.dataset.src = bgThumb(c.id);
    if (ioCardBg) ioCardBg.observe(bg);

    // キャラ本体
    const img = document.createElement('img');
    img.className = 'card-img';
    img.alt = c.name || '';
    img.loading = 'lazy';
    img.dataset.src = imgSrcFor(c.id);
    setFallbackOnError(img);
    if (ioCardBg) ioCardBg.observe(img);

    // ここでwiggleをバインド！
    attachWiggle(img);

    media.appendChild(bg);
    media.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'card-caption';
    cap.innerHTML = `<span class="card-id">${c.id}</span> <span class="card-name">${escapeHtml(c.name||'')}</span>`;

    card.appendChild(media);
    card.appendChild(cap);
    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}
// --- 末尾に「＋ 新しいパレット」を追加（モック起動） ---
function appendPaletteAddButton(panel){
  const add = document.createElement('button');
  add.className = 'palette-option palette-add';
  add.setAttribute('type','button');
  add.innerHTML = `
    <div class="bars"></div>
    <div class="label">新しいパレット</div>
  `;
  add.addEventListener('click', openPaletteNewModal);
  panel.appendChild(add);
}

// 既存の一覧描画の最後で呼ぶ
const _renderPaletteList = renderPaletteList;
renderPaletteList = function(palettes, activeKey){
  _renderPaletteList(palettes, activeKey);
  const panel = document.getElementById('palette-panel');
  if (panel) appendPaletteAddButton(panel);
};

/* ========= パレット作成モーダル（機能版） ========= */

// 代表色プリセット（必要に応じて増やしてください）
const PALETTE_PRESETS = [
  '#000000','#333333','#666666','#888888','#AAAAAA','#FFFFFF',
  '#7A6B58','#B07C6B','#C27D7B','#D27F7F','#E3A36F','#F4C66F',
  '#D7E3E6','#EDE6D6','#F0F4F8','#F6E7EC','#E6F3EA','#EAF0E5',
  '#1E88E5','#00ACC1','#26A69A','#43A047','#7CB342','#F4511E',
];

function normalizeHex(v){
  const s = (v||'').trim();
  if (/^#([0-9a-f]{3}){1,2}$/i.test(s)) {
    return s.length===4
      ? '#'+s.slice(1).split('').map(ch=>ch+ch).join('').toUpperCase()
      : s.toUpperCase();
  }
  return '';
}

function getComputedCssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

function openPaletteNewModal(){
  const modal = document.getElementById('palette-new-modal');
  if (!modal) return;
  const panel = modal.querySelector('.modal-panel');

  // 初期値＝現在のテーマ色
  const state = {
    base:   getComputedCssVar('--base-color')   || '#888888',
    accent: getComputedCssVar('--accent-color') || '#7A6B58',
    sub:    getComputedCssVar('--sub-color')    || '#D7E3E6',
  };

  // モーダル内CSS変数へ反映（リアルタイムプレビュー用）
  const applyToModal = () => {
    panel.style.setProperty('--m-base',   state.base);
    panel.style.setProperty('--m-accent', state.accent);
    panel.style.setProperty('--m-sub',    state.sub);

    // スウォッチ塗り
    modal.querySelectorAll('.pnm-row').forEach(row=>{
      const key = row.dataset.key;
      row.querySelector('.pnm-swatch').style.background = state[key];
    });
  };

  // コントロール初期化
  function initRow(row, key){
    const picker = row.querySelector('.ctrl-picker');
    const preset = row.querySelector('.ctrl-preset');
    const code   = row.querySelector('.ctrl-code');

    // 既定色プルダウンを構築
    if (preset && !preset.children.length){
      PALETTE_PRESETS.forEach(hex=>{
        const opt = document.createElement('option');
        opt.value = hex; opt.textContent = hex;
        opt.style.background = hex;
        preset.appendChild(opt);
      });
    }

    // 初期値を各UIに同期
    picker.value = state[key];
    code.value   = state[key];
    if (preset) preset.value = PALETTE_PRESETS.includes(state[key]) ? state[key] : PALETTE_PRESETS[0];

    // 入力ハンドラ
    picker.oninput = () => { state[key] = picker.value; code.value = state[key]; applyToModal(); };
    preset.onchange = () => { state[key] = preset.value; picker.value = state[key]; code.value = state[key]; applyToModal(); };
    code.oninput = () => {
      const hex = normalizeHex(code.value);
      if (hex){ state[key] = hex; picker.value = hex; preset.value = PALETTE_PRESETS.includes(hex)? hex : PALETTE_PRESETS[0]; applyToModal(); }
    };

    // 入力方法タブの切替
    row.querySelector('.pnm-tabs').addEventListener('click', e=>{
      const b = e.target.closest('button'); if(!b) return;
      const mode = b.dataset.mode;
      row.querySelectorAll('.pnm-tabs > button').forEach(x=>{
        x.classList.toggle('is-active', x===b);
        x.setAttribute('aria-selected', x===b ? 'true':'false');
      });
      picker.hidden = mode!=='picker';
      preset.hidden = mode!=='preset';
      code.hidden   = mode!=='code';
    });
  }

  // culori helpers
const { converter, formatHex, clampChroma, mapAlpha, darken, brighten } = culori;
const toOklch = converter('oklch');
const fromOklch = (oklch) => formatHex(oklch); // culoriはHex文字列を返せます

// WCAG 2.1 コントラスト簡易チェック
function lumRGB(c){ // sRGB → 相対輝度
  const cs = c/255;
  return (cs <= 0.03928) ? cs/12.92 : Math.pow((cs+0.055)/1.055, 2.4);
}
function hexToRgb(hex){
  const s = hex.replace('#',''); return {
    r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16)
  };
}
function contrast(hex1, hex2){
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  const L1 = 0.2126*lumRGB(a.r)+0.7152*lumRGB(a.g)+0.0722*lumRGB(a.b);
  const L2 = 0.2126*lumRGB(b.r)+0.7152*lumRGB(b.g)+0.0722*lumRGB(b.b);
  const lighter = Math.max(L1,L2)+0.05, darker = Math.min(L1,L2)+0.05;
  return lighter/darker; // 4.5以上が小テキスト目安
}

// hue回転（度数）
function rotHue(h, deg){
  let nh = (h + deg) % 360;
  if (nh < 0) nh += 360;
  return nh;
}

function makePaletteFromBase(baseHex){
  // ベース OKLCH
  const b = toOklch(baseHex); // {l,c,h}
  // サブ：同系色で L↑ / C↓
  const sub = { l: Math.min(1, b.l + 0.06), c: Math.max(0, b.c - 0.02), h: b.h };
  // アクセント候補を作るヘルパ
  const makeAcc = (deg) => ({
    l: 0.60,                   // 見栄えが出やすい帯域
    c: Math.max(0.10, b.c+0.08), // ベースより鮮やかに
    h: rotHue(b.h || 0, deg)
  });
  return {
    base: baseHex,
    schemes: [
      { key:'complement',  title:'補色',       acc: [makeAcc(180), makeAcc(176), makeAcc(184)] },
      { key:'split',       title:'分割補色',   acc: [makeAcc(150), makeAcc(210), makeAcc(330)] },
      { key:'triad',       title:'トライアド', acc: [makeAcc(120), makeAcc(240), makeAcc(-120)] },
    ].map(g => ({
      ...g,
      variants: g.acc.map(a => {
        const accentHex = fromOklch(a);
        const subHex    = fromOklch(sub);
        return { base: baseHex, accent: accentHex, sub: subHex };
      })
    }))
  };
}

function renderSuggestGroups(container, mk){
  container.innerHTML = '';
  mk.schemes.forEach(group=>{
    const box = document.createElement('div');
    box.className = 'suggest-group';
    box.innerHTML = `<div class="suggest-title">${group.title}</div><div class="suggest-cards"></div>`;
    const wrap = box.querySelector('.suggest-cards');

    group.variants.forEach(v=>{
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 's-card';
      c.innerHTML = `
        <div class="bars">
          <div class="b" style="background:${v.base}"></div>
          <div class="a" style="background:${v.accent}"></div>
          <div class="s" style="background:${v.sub}"></div>
        </div>
        <div class="mini">
          <div class="hdr" style="background:${v.sub}; color:${v.base};">ヘッダー</div>
          <div class="btn" style="background:${v.accent}; color:${v.base};">ボタン</div>
        </div>
        <div class="badges"></div>
      `;
      // コントラスト判定バッジ
      const badges = c.querySelector('.badges');
      const cardCT = contrast(v.base, v.sub);
      const btnCT  = contrast(v.base, v.accent);
      const b1 = document.createElement('span');
      b1.className = 'badge ' + (cardCT>=4.5?'ok':'warn');
      b1.textContent = 'カード '+cardCT.toFixed(1);
      const b2 = document.createElement('span');
      b2.className = 'badge ' + (btnCT>=4.5?'ok':'warn');
      b2.textContent = 'ボタン '+btnCT.toFixed(1);
      badges.append(b1,b2);

      // クリックで適用
      c.addEventListener('click', ()=>{
        // モーダル内のstateに反映
        applySuggestedToModal(v);
      });
      wrap.appendChild(c);
    });
    container.appendChild(box);
  });
}

function applySuggestedToModal(v){
  // 入力エリアの3色も同期（ピッカー/コード）
  const modal = document.getElementById('palette-new-modal');
  const rows = modal.querySelectorAll('.pnm-row');
  const set = (key, hex) => {
    const row = [...rows].find(r=>r.dataset.key===key);
    row.querySelector('.ctrl-picker').value = hex;
    row.querySelector('.ctrl-code').value   = hex;
  };
  set('base', v.base);
  set('accent', v.accent);
  set('sub', v.sub);

  // 「一時適用」と同じくモーダル内CSS変数＆プレビューを更新
  const panel = modal.querySelector('.modal-panel');
  panel.style.setProperty('--m-base', v.base);
  panel.style.setProperty('--m-accent', v.accent);
  panel.style.setProperty('--m-sub', v.sub);

  // スウォッチ
  rows.forEach(r=>{
    const key = r.dataset.key;
    const hex = v[key];
    r.querySelector('.pnm-swatch').style.background = hex;
  });

  // 上部のバー
  const listbar = modal.querySelector('.pnm-listbar .bars');
  listbar.querySelector('.base').style.background   = v.base;
  listbar.querySelector('.accent').style.background = v.accent;
  listbar.querySelector('.sub').style.background    = v.sub;
}


  modal.hidden = false;
  // Escや背景クリックで閉じる
  const close = ()=>{ modal.hidden = true; cleanup(); };
  modal.querySelector('.modal-backdrop')?.addEventListener('click', close, { once:true });
  modal.querySelector('#pnm-cancel')?.addEventListener('click', close, { once:true });
  modal.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); }, { once:true });

  // 行ごと初期化
  modal.querySelectorAll('.pnm-row').forEach(row => {
    const key = row.dataset.key;
    // 既存テーマから初期値
    row.querySelector('.ctrl-picker').value = state[key];
    row.querySelector('.ctrl-code').value   = state[key];
    initRow(row, key);
  });

  // リストのバーと名前（ダミー）
  const listbar = modal.querySelector('.pnm-listbar .name');
  if (listbar) listbar.textContent = '（新規パレット）';

  // 一時適用：ドキュメントに反映して“画面全体”を試す
  modal.querySelector('#pnm-try')?.addEventListener('click', ()=>{
    document.documentElement.style.setProperty('--base-color',   state.base);
    document.documentElement.style.setProperty('--accent-color', state.accent);
    document.documentElement.style.setProperty('--sub-color',    state.sub);
    // パレットパネルのUIも見た目だけ同期しておくと混乱しない
    showToast('一時適用しました（保存は未実装）');
  });

  // 保存はまだモック（将来：palettes.jsonへPOST/PATCH）
  modal.querySelector('#pnm-save')?.addEventListener('click', ()=>{
    showToast('保存は後続実装です', 'err');
  });

  // 初期反映
  applyToModal();
//
// 既存 openPaletteNewModal() の末尾あたりに “ホイール初期化＆サジェスト作成” を追記
//
(function patchModalForWheel(){
  const origOpen = openPaletteNewModal;
  openPaletteNewModal = function(){
    origOpen(); // 元の初期化（state, applyToModal など）を実行

    const modal = document.getElementById('palette-new-modal');
    const panel = modal.querySelector('.modal-panel');
    const suggestWrap = modal.querySelector('#suggestGroups');
    const baseL = modal.querySelector('#baseL');
    const baseC = modal.querySelector('#baseC');

    // 現在のベース（モーダルCSS変数から）
    let baseHex = getComputedStyle(panel).getPropertyValue('--m-base').trim() || '#888888';
    // ホイール作成
    const wheel = new iro.ColorPicker('#baseColorWheel', {
      width: 260, color: baseHex, layout: [{ component: iro.ui.Wheel }]
    });

    // L/C スライダー初期値（OKLCHで）
    const b0 = toOklch(baseHex);
    baseL.value = b0.l.toFixed(2);
    baseC.value = Math.min(0.25, Math.max(0, b0.c)).toFixed(3);

    function updateFromWheel(){
      // wheelはHSL基準なので、いったんHEX→OKLCH
      let hex = wheel.color.hexString;
      let o = toOklch(hex);
      // L/Cはスライダーで上書き
      o.l = parseFloat(baseL.value);
      o.c = parseFloat(baseC.value);
      // 再HEX
      baseHex = fromOklch(o);
      // モーダルCSSに反映（即プレビュー）
      panel.style.setProperty('--m-base', baseHex);
      // 上行スウォッチ＆入力も同期
      const baseRow = modal.querySelector('.pnm-row[data-key="base"]');
      baseRow.querySelector('.pnm-swatch').style.background = baseHex;
      baseRow.querySelector('.ctrl-picker').value = baseHex;
      baseRow.querySelector('.ctrl-code').value   = baseHex;

      // サジェスト再生成
      const mk = makePaletteFromBase(baseHex);
      renderSuggestGroups(suggestWrap, mk);
    }

    wheel.on('input:end', updateFromWheel);
    baseL.addEventListener('input', updateFromWheel);
    baseC.addEventListener('input', updateFromWheel);

    // 最初の描画
    const mk0 = makePaletteFromBase(baseHex);
    renderSuggestGroups(suggestWrap, mk0);
  };
})();
  function cleanup(){ /* 今回は特になし */ }
}


function applyFilters(){
  const kw = keyword.toLowerCase();
  const isAll = (activeSeries === 'all');

  filteredCharacters = sortCharacters(
    characters.filter(c=>{
      if (!isAll){
        const seriesArr = asSeriesArray(c);
        if (!seriesArr.includes(activeSeries)) return false;
      }
      if (statusFilter === 'wip'  && !isPending(c)) return false;
      if (statusFilter === 'done' &&  isPending(c)) return false;

      if (kw){
        const p = c.profile || {};
        const text = [
          c.id, c.name, ...(asSeriesArray(c)),
          p['住んでいるところ']||'', p['好きなもの・こと']||'', p['イメージカラー']||'',
          c.appearance||'', c.memo||''
        ].join(' ').toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    })
  );

  renderList(filteredCharacters);
  renderSummaryBar();
}

function renderSummaryBar(){
  const total = characters.length;
  const done  = characters.filter(c=>!isPending(c)).length;
  const wip   = total - done;

  $id('sum-txt-total').textContent = String(total);
  $id('sum-txt-done').textContent  = String(done);
  $id('sum-txt-wip').textContent   = String(wip);
  $id('sum-txt-rate').textContent  = total ? Math.round(done/total*100)+'%' : '0%';

  $id('sum-bar-done').style.width  = total ? (done/total*100)+'%' : '0%';
  $id('sum-bar-wip').style.width   = total ? (wip /total*100)+'%' : '0%';

  $id('sum-count-done').textContent = String(done);
  $id('sum-count-wip').textContent  = String(wip);

  const pillDone = $id('sum-pill-done');
  const pillWip  = $id('sum-pill-wip');
  pillDone.setAttribute('aria-pressed', String(statusFilter==='done'));
  pillWip .setAttribute('aria-pressed', String(statusFilter==='wip'));

  pillDone.onclick = ()=>{ statusFilter = (statusFilter==='done')?null:'done'; applyFilters(); };
  pillWip .onclick = ()=>{ statusFilter = (statusFilter==='wip') ?null:'wip';  applyFilters(); };

  const clear = $id('sum-clear');
  clear.hidden = !statusFilter && activeSeries==='all' && !keyword;
  clear.onclick = ()=>{
    statusFilter=null; activeSeries='all'; keyword='';
    $id('search-box').value='';
    [...$id('series-filter').children].forEach(b=>b.classList.toggle('is-active', b.dataset.series==='all'));
    applyFilters();
  };
}

/* ===============================
   Detail view
================================ */
function showList(){
  document.body.classList.remove('mode-detail');
  document.body.classList.add('mode-list');
  $id('detail-view').classList.add('hidden');
  $id('list-view').classList.remove('hidden');
}
function showDetail(){
  if (!filteredCharacters.length) return;
  document.body.classList.remove('mode-list');
  document.body.classList.add('mode-detail');
  $id('list-view').classList.add('hidden');
  $id('detail-view').classList.remove('hidden');
  loadCharacter(currentIndex);
}
function loadCharacter(index){
  const c = filteredCharacters[index];
  if (!c) return;

  // 画像
  const hero = $id('detail-img');
  hero.src = imgSrcFor(c.id);
  hero.alt = c.name || '';
  setFallbackOnError(hero);

  // wiggle適用
  attachWiggle(hero);

  // 概要（シリーズ）
  const series = asSeriesArray(c).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join(' ');
  $id('character-summary').innerHTML = `
    <p>No.${escapeHtml(c.id)}</p>
    <h2>${escapeHtml(c.name||'')}</h2>
    <div>シリーズ：${series || '—'}</div>
  `;

  // プロフィール / 見た目 / メモ
  const p = c.profile || {};
  $id('profile').innerHTML =
    `<h3>プロフィール</h3>
     <div>住んでいるところ：${escapeHtml(p['住んでいるところ']||PLACEHOLDER)}</div>
     <div>好きなもの・こと：${escapeHtml(p['好きなもの・こと']||PLACEHOLDER)}</div>
     <div>イメージカラー：<span class="color-dot" style="background:${escapeHtml(p['イメージカラー']||'transparent')}"></span></div>`;
  $id('appearance').innerHTML = `<h3>見た目</h3><div>${escapeHtml(c.appearance||PLACEHOLDER)}</div>`;
  $id('memo').innerHTML       = `<h3>メモ</h3><div>${escapeHtml(c.memo||PLACEHOLDER)}</div>`;

  // 背景：LQIP → 本番候補
  loadDetailBackground(c.id);
}
async function loadDetailBackground(id){
  const reqId = ++currentBgReqId;
  const bg = $id('detail-bg');
  bg.src = lqipSrc(id);
  bg.style.filter = 'blur(8px)'; bg.style.transform = 'scale(1.02)';

  for (const url of bgCandidates(id)){
    const ok = await new Promise(res=>{
      const i = new Image();
      i.onload  = ()=>res(true);
      i.onerror = ()=>res(false);
      i.src = url;
    });
    if (!ok) continue;
    if (reqId !== currentBgReqId) return; // 競合で破棄
    bg.onload = ()=>{ bg.style.filter=''; bg.style.transform=''; };
    bg.src = url;
    return;
  }
}

/* ===============================
   Edit mode (簡潔)
================================ */
let tempEdited = null;
function enterEditMode(){
  isEditing = true;
  document.body.classList.add('is-editing');
  if ($id('detail-view').classList.contains('hidden')) showDetail();
  tempEdited = JSON.parse(JSON.stringify(filteredCharacters[currentIndex]));
  renderEditable();
  $id('edit-actions').hidden = false;
  $id('edit-btn').textContent = '編集終了';
  refreshSaveState();
}
function exitEditMode(){
  isEditing = false;
  document.body.classList.remove('is-editing');
  tempEdited = null;
  $id('edit-actions').hidden = true;
  $id('edit-btn').textContent = '✎';
  if (!$id('detail-view').classList.contains('hidden')) loadCharacter(currentIndex);
}

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
  const hit = COLOR_24.find(([h])=>h.toUpperCase()===hex.toUpperCase());
  return hit ? `${hit[1]}${hit[2]?` / ${hit[2]}`:''}` : '';
}

function renderEditable(){
  const data = tempEdited || filteredCharacters[currentIndex] || {};
  data.profile ||= {};
  if (!Array.isArray(data.series)) data.series = asSeriesArray(data);

  // 左上カード（シリーズ編集）
  const allSeries = Array.from(new Set(characters.flatMap(c=>asSeriesArray(c)))).filter(Boolean);
  const summary = $id('character-summary');
  summary.innerHTML = `
    <p>No.${data.id}</p>
    <h2>${escapeHtml(data.name||'')}</h2>
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
    const wrap = $id('series-tags'); wrap.innerHTML = '';
    (data.series||[]).forEach(s=>{
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${escapeHtml(s)}<span class="remove" title="削除">✕</span>`;
      el.querySelector('.remove').onclick = ()=>{
        data.series = data.series.filter(x=>x!==s);
        renderSeriesTags(); refreshSaveState();
      };
      wrap.appendChild(el);
    });
  }
  renderSeriesTags();
  $id('series-input').addEventListener('keydown', e=>{
    if (e.key==='Enter'){
      const v = e.target.value.trim();
      if (v && !data.series.includes(v)){
        data.series.push(v); renderSeriesTags(); e.target.value=''; refreshSaveState();
      }
      e.preventDefault();
    }
  });

  // 右上プロフィール編集
  const nowHex = toHexColor(data.profile['イメージカラー']);
  const options = COLOR_24.map(([hex,en,ja])=>{
    const sel  = (hex && nowHex && hex.toUpperCase()===nowHex) ? ' selected' : '';
    const text = en + (ja?` / ${ja}`:'');
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
      <span class="color-dot" id="edit-color-dot" style="background:${nowHex||'transparent'}"></span>
      <span class="color-text" id="edit-color-text">${colorLabel(nowHex||'')}</span>
    </label>
  `;
  $id('edit-home') ?.addEventListener('input', e=>{ data.profile['住んでいるところ'] = e.target.value; refreshSaveState(); });
  $id('edit-like') ?.addEventListener('input', e=>{ data.profile['好きなもの・こと'] = e.target.value; refreshSaveState(); });
  $id('edit-color')?.addEventListener('change', e=>{
    const hex = e.target.value; data.profile['イメージカラー'] = hex || '';
    $id('edit-color-dot').style.background = hex || 'transparent';
    $id('edit-color-text').textContent = colorLabel(hex||'');
    refreshSaveState();
  });

  // 2行目テキスト
  $id('appearance').innerHTML = `<h3>見た目</h3><textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>`;
  $id('memo').innerHTML       = `<h3>メモ</h3><textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>`;
  $id('edit-appearance')?.addEventListener('input', e=>{ data.appearance = e.target.value; refreshSaveState(); });
  $id('edit-memo')?.addEventListener('input', e=>{ data.memo = e.target.value; refreshSaveState(); });
}

function validateEdited(data){
  const errors = {};
  if ((data.appearance||'').length > 1000) errors.appearance = '1000文字以内で入力してください。';
  if ((data.memo||'').length       > 1000) errors.memo       = '1000文字以内で入力してください。';

  const appTa  = $id('edit-appearance');
  const memoTa = $id('edit-memo');
  appTa  && appTa .classList.toggle('invalid', !!errors.appearance);
  memoTa && memoTa.classList.toggle('invalid', !!errors.memo);

  return { ok: Object.keys(errors).length===0, errors };
}
function refreshSaveState(){
  const btn = $id('edit-save');
  if (!btn || !tempEdited) return;
  const { ok } = validateEdited(tempEdited);
  btn.disabled = !ok;
}
async function onSaveClick(){
  if (!tempEdited) return;
  const { ok } = validateEdited(tempEdited);
  if (!ok){ alert('未入力や不正な入力があります。赤枠をご確認ください。'); return; }

  const btn = $id('edit-save'); const prev = btn.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy','true'); btn.textContent = '保存中…';

  const p = tempEdited.profile || {};
  const payload = {
    id: tempEdited.id,
    series: Array.isArray(tempEdited.series) ? tempEdited.series : asSeriesArray(tempEdited),
    profile: {
      '住んでいるところ': withInvestigating(p['住んでいるところ']),
      '好きなもの・こと': withInvestigating(p['好きなもの・こと']),
      'イメージカラー':   withInvestigating(p['イメージカラー'] || '')
    },
    appearance: withInvestigating(tempEdited.appearance || ''),
    memo:       withInvestigating(tempEdited.memo || '')
  };

  try{
    await apiPatchCharacter(payload);
    const id = tempEdited.id;
    await reloadDataFresh(id);
    exitEditMode();
    showDetail();
    showToast('保存しました');
  }catch(e){
    console.error(e);
    if(String(e).includes('401')) showToast('パスワードが違います','err');
    else showToast('保存に失敗しました','err');
  }finally{
    btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=prev;
  }
}

/* ===============================
   Palette (既存)
================================ */
async function loadPalettes(){
  const res = await fetch('data/palettes.json?v=' + Date.now(), { cache:'no-store' });
  if (!res.ok) return;
  const palettes = await res.json();

  const savedKey = localStorage.getItem('theme.palette.key');
  const initial  = palettes.find(p => p.key === savedKey) || palettes[0];
  applyPalette(initial);

  renderPaletteList(palettes, initial.key); // ← activeKey を渡す
}
function applyPalette(p){
  if (!p) return;
  const root=document.documentElement;
  root.style.setProperty('--base-color',   p.base);
  root.style.setProperty('--accent-color', p.accent);
  root.style.setProperty('--sub-color',    p.sub);
  localStorage.setItem('theme.palette.key', p.key);
}
function renderPaletteList(palettes, activeKey){
  const panel = $id('palette-panel'); if (!panel) return;
  panel.innerHTML = '';
  panel.setAttribute('role','listbox');

  palettes.forEach(p=>{
    const btn = document.createElement('button');
    btn.className = 'palette-option' + (p.key===activeKey ? ' is-active' : '');
    btn.setAttribute('role','option');
    btn.setAttribute('aria-pressed', String(p.key===activeKey));
    btn.dataset.key = p.key;

    // 色バーとラベル
    btn.innerHTML = `
      <div class="bars" style="--base-color:${p.base};--accent-color:${p.accent};--sub-color:${p.sub}">
        <span class="base"></span><span class="accent"></span><span class="sub"></span>
      </div>
      <div class="label">${p.name}</div>
    `;

    btn.addEventListener('click', ()=>{
      applyPalette(p);
      // 見た目の選択状態を更新
      panel.querySelectorAll('.palette-option').forEach(el=>{
        const on = el.dataset.key === p.key;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-pressed', String(on));
      });
      panel.hidden = true; // 選択後は閉じる
    });

    panel.appendChild(btn);
  });

  // トグル動作（既存を活かしつつ）
  const btnToggle = $id('palette-btn');
  btnToggle.onclick = (e)=>{ e.stopPropagation(); panel.hidden = !panel.hidden; };
  document.addEventListener('click', (e)=>{
    if (!panel.hidden && !panel.contains(e.target) && e.target!==btnToggle) panel.hidden = true;
  });
}

/* ===============================
   Toast
================================ */
function showToast(msg, type='ok'){
  if (!document.getElementById('toast-style')) {
    const style=document.createElement('style'); style.id='toast-style';
    style.textContent = `
      .toast{position:fixed;right:16px;top:16px;z-index:3000;display:flex;flex-direction:column;gap:8px}
      .toast-item{padding:10px 12px;border-radius:10px;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:14px}
      .toast-ok{background:#16a34a}.toast-err{background:#ef4444}`;
    document.head.appendChild(style);
  }
  let root=document.querySelector('.toast');
  if(!root){ root=document.createElement('div'); root.className='toast'; document.body.appendChild(root); }
  const el=document.createElement('div');
  el.className=`toast-item toast-${type==='err'?'err':'ok'}`;
  el.textContent=msg;
  root.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; }, 1600);
  setTimeout(()=>{ el.remove(); }, 2100);
}
function openFullScreen(id, name){
  const modal = $id('fs-modal');
  const bgEl  = $id('fs-bg');
  const chEl  = $id('fs-char');

  // 低解像から順に読み替える（既存の bgCandidates を活用）
  bgEl.src = lqipSrc(id);
  (async () => {
    for (const url of bgCandidates(id)){
      const ok = await new Promise(res=>{
        const im=new Image(); im.onload=()=>res(true); im.onerror=()=>res(false); im.src=url;
      });
      if (ok){ bgEl.src = url; break; }
    }
  })();

  chEl.src = imgSrcFor(id);
  chEl.alt = name || '';

  setFallbackOnError(chEl);

  modal.hidden = false;
  modal.classList.add('show');
}
function closeFullScreen(){
  const modal = $id('fs-modal');
  modal.classList.remove('show');
  modal.hidden = true;
}

function setFsForIndex(idx){
  const c = filteredCharacters[idx]; if(!c) return;
  const bgEl=$id('fs-bg'), chEl=$id('fs-char');

  // 低解像→高解像へ順次（既存ユーティリティを再利用）
  bgEl.src = lqipSrc(c.id);
  (async () => {
    for (const url of bgCandidates(c.id)){
      const ok = await new Promise(res=>{
        const im=new Image(); im.onload=()=>res(true); im.onerror=()=>res(false); im.src=url;
      });
      if (ok){ bgEl.src = url; break; }
    }
  })();
  chEl.src = imgSrcFor(c.id);
  chEl.alt = c.name || '';
}

function openFullScreenByIndex(idx){
  currentIndex = (idx + filteredCharacters.length) % filteredCharacters.length;
  $id('fs-modal').hidden = false;
  setFsForIndex(currentIndex);
}
function openFullScreen(idOrIndex){
  // 旧API互換：id（"001"等）が来たらindexへ解決
  if (typeof idOrIndex === 'string'){
    const i = filteredCharacters.findIndex(x=>x.id===idOrIndex);
    if (i>=0) openFullScreenByIndex(i);
  } else {
    openFullScreenByIndex(idOrIndex|0);
  }
}
function closeFullScreen(){ $id('fs-modal').hidden = true; }

// 詳細のキャラをクリック→現在indexで開く（既存を置換）
$id('detail-img')?.addEventListener('click', ()=> openFullScreenByIndex(currentIndex));

// FSナビ
$id('fs-prev')?.addEventListener('click', (e)=>{ e.stopPropagation(); openFullScreenByIndex(currentIndex-1); });
$id('fs-next')?.addEventListener('click', (e)=>{ e.stopPropagation(); openFullScreenByIndex(currentIndex+1); });

// ------- wiggle helpers -------
function attachWiggle(el){
  if(!el) return;
  const trigger = ()=>{
    el.classList.add('wiggle');
    setTimeout(()=> el.classList.remove('wiggle'), 650);
  };
  // マウス（ポインタが細かい環境のみ）
  el.addEventListener('pointerenter', ()=>{
    if (window.matchMedia('(pointer: fine)').matches) trigger();
  }, {passive:true});
  // タップ（iPad/iPhone含む）
  el.addEventListener('touchstart', trigger, {passive:true});
  // キーボード（アクセシビリティ）
  el.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') trigger();
  });
}