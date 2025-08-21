// ====== state ======
let characters = [];
let filteredCharacters = [];
let currentIndex = 0;
let activeSeries = 'all';
let keyword = '';
let tempEdited = null; // 編集ワーク
let statusFilter = null; // null | 'wip' | 'done'
let adminSecret = '';
let currentBgReqId = 0; // 詳細背景の競合防止
let ioCardBg = null; // 一覧カードの遅延読込IO
const $id = (id) => document.getElementById(id);

// ====== images helpers ======
function imgSrcFor(id){ return `images/${id}.png`; }
function bgCandidates(id){
// 生成予定の順で候補を返す（上から順に試す）
return [
`images/bg_${id}_1600.webp`,
`images/bg_${id}_800.webp`,
`images/bg_${id}_400.webp`,
`images/bg${id}.png`, // 既存フォールバック
];
}
function lqipSrc(id){ return `images/lqip/bg_${id}_24.webp`; }
function setFallbackOnError(imgEl){ imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = 'images/placeholder.png'; }; }


const PLACEHOLDER = '--調査中--';
function isPending(c){
const p = c.profile || {};
const vals = [ p['住んでいるところ'], p['好きなもの・こと'], p['イメージカラー'], c.appearance, c.memo ];
return vals.some(v => {
const s = (v ?? '').toString().trim();
return s === '' || s === PLACEHOLDER;
});
}

// ====== data load ======
// ★ Vercel統合版：APIは同一オリジン
const API_BASE = location.origin;
// GETを /api/characters → ダメなら /api/characters.js で再試行
async function fetchCharactersSafe(){
  const urls = [`${API_BASE}/api/characters`, `${API_BASE}/api/characters.js`];
  for (const url of urls){
    try{
      const r = await fetch(url, { cache:'no-store' });
      if (r.ok) return await r.json();
    }catch(e){ /* next */ }
  }
  throw new Error('characters API not available');
}
async function loadData(){
  try{
    characters = await fetchCharactersSafe();
    filteredCharacters = sortCharacters(characters);
    renderList(filteredCharacters);
    wireHeaderHandlers();
    renderSummaryBar();
  }catch(e){
    console.error('API読み込み失敗:', e);
    alert('データ読み込みに失敗しました。/api/characters を確認してください。');
  }
}

async function apiPatchCharacter(payload){
  const urls = [`${API_BASE}/api/characters`, `${API_BASE}/api/characters.js`];
  let last;
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
    const res = await fetch(`${API_BASE}/api/characters`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    characters = Array.isArray(list) ? list : [];
    filteredCharacters = sortCharacters(characters);

    if (preserveId){
      const idx = filteredCharacters.findIndex(c => c.id === preserveId);
      if (idx >= 0) currentIndex = idx;
    }
    applyFilters(); // 再描画・サマリー更新
  }catch(e){
    console.error('再取得に失敗:', e);
    showToast('最新データの取得に失敗しました','err');
  }
}
function wireHeaderHandlers(){
  // 検索
  const search = $id('search-box');
  if (search && !search.dataset.bound){
    search.addEventListener('input', e => {
      keyword = (e.target.value||'');
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

  // 編集モーダル
  const editBtn    = $id('edit-btn');
  const modalLayer = $id('pw-modal');
  const pwInput    = $id('pw-input');
  const pwOk       = $id('pw-ok');
  const pwCancel   = $id('pw-cancel');
  const pwError    = $id('pw-error');
  const backdrop   = modalLayer?.querySelector('.modal-backdrop');
  const panel      = modalLayer?.querySelector('.modal-panel');

  function openPwModal(){
    if (!modalLayer) return;
    pwError.hidden = true; pwInput.value = '';
    modalLayer.hidden = false; modalLayer.classList.add('show');
    setTimeout(()=>pwInput.focus(),0);
  }
  function closePwModal(){
    if (!modalLayer) return;
    modalLayer.classList.remove('show'); modalLayer.hidden = true;
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

  // 調査中トグル
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

  // ナビ/戻る
  document.querySelector('.back-button')?.addEventListener('click', showList);
  document.querySelector('.nav-button.next')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex+1) % filteredCharacters.length; loadCharacter(currentIndex);
  });
  document.querySelector('.nav-button.prev')?.addEventListener('click', ()=>{
    currentIndex = (currentIndex-1+filteredCharacters.length) % filteredCharacters.length; loadCharacter(currentIndex);
  });
}



// ====== edit mode (一部既存) ======
let isEditing = false;
function enterEditMode(){ isEditing = true; document.body.classList.add('is-editing'); if ($id('detail-view').classList.contains('hidden')) { showDetail(); } tempEdited = JSON.parse(JSON.stringify(filteredCharacters[currentIndex])); renderEditableFields(); const btn = $id('edit-btn'); if (btn) btn.textContent = '編集終了'; $id('edit-actions').hidden = false; refreshSaveState(); }
function exitEditMode(){ isEditing = false; document.body.classList.remove('is-editing'); tempEdited = null; if (!$id('detail-view').classList.contains('hidden')) loadCharacter(currentIndex); const btn = $id('edit-btn'); if (btn) btn.textContent = '✎'; $id('edit-actions').hidden = true; }

function renderEditableFields(){
const data = tempEdited || filteredCharacters[currentIndex] || {};
const allSeries = Array.from(new Set(characters.flatMap(c=>asSeriesArray(c)))).filter(Boolean);
if (!Array.isArray(data.series)) data.series = asSeriesArray(data);
const summary = $id('character-summary');
summary.innerHTML = `
<p>No.${data.id}</p>
<h2>${data.name}</h2>
<label>シリーズ：</label>
<div class="tags" id="series-tags"></div>
<div class="tag-input">
<input id="series-input" list="series-datalist" placeholder="シリーズを追加（Enter）" />
<datalist id="series-datalist">${allSeries.map(s=>`<option value="${s}">`).join('')}</datalist>
</div>
<div id="series-error" class="field-error" style="display:none;">シリーズを1つ以上選んでください。</div>`;
function renderSeriesTags(){ const wrap = $id('series-tags'); wrap.innerHTML = ''; (data.series||[]).forEach(s=>{ const el = document.createElement('span'); el.className = 'tag'; el.innerHTML = `${s}<span class="remove" title="削除">✕</span>`; el.querySelector('.remove').onclick = ()=>{ data.series = data.series.filter(x=>x!==s); renderSeriesTags(); refreshSaveState(); }; wrap.appendChild(el); }); }
renderSeriesTags();
const seriesInput = $id('series-input');
seriesInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ const v = seriesInput.value.trim(); if (v && !data.series.includes(v)){ data.series.push(v); renderSeriesTags(); seriesInput.value=''; refreshSaveState(); } e.preventDefault(); } });
data.profile ||= {};


const nowHex = toHexColor(data.profile['イメージカラー']);
const options = COLOR_24.map(([hex,en,ja])=>{ const sel = (hex && nowHex && hex.toUpperCase()===nowHex) ? ' selected' : ''; const text = en + (ja ? ` / ${ja}` : ''); return `<option value="${hex}"${sel}>${text}</option>`; }).join('');
$id('profile').innerHTML = `
<h3>プロフィール</h3>
<label>住んでいるところ：<input id="edit-home" class="edit-field" value="${escapeHtml(data.profile['住んでいるところ']||'')}"></label><br><br>
<label>好きなもの・こと：<input id="edit-like" class="edit-field" value="${escapeHtml(data.profile['好きなもの・こと']||'')}"></label><br><br>
<label class="color-row">イメージカラー：
<select id="edit-color" class="edit-field select">${options}</select>
<span class="color-chip" id="edit-color-dot" style="background:${nowHex || 'transparent'}"></span>
<span class="color-text" id="edit-color-text">${colorLabel(nowHex||'')}</span>
</label>`;
$id('edit-home')?.addEventListener('input', e=>{ data.profile['住んでいるところ'] = e.target.value; refreshSaveState(); });
$id('edit-like')?.addEventListener('input', e=>{ data.profile['好きなもの・こと'] = e.target.value; refreshSaveState(); });
$id('edit-color')?.addEventListener('change', e=>{ const hex = e.target.value; data.profile['イメージカラー'] = hex || ''; const dot=$id('edit-color-dot'); if (dot) dot.style.background = hex || 'transparent'; const text=$id('edit-color-text'); if (text) text.textContent = colorLabel(hex||''); refreshSaveState(); });
$id('appearance').innerHTML = `<h3>見た目</h3><textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>`;
$id('edit-appearance')?.addEventListener('input', e=>{ data.appearance = e.target.value; refreshSaveState(); });
$id('memo').innerHTML = `<h3>メモ</h3><textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>`;
$id('edit-memo')?.addEventListener('input', e=>{ data.memo = e.target.value; refreshSaveState(); });
}


const COLOR_24 = [
['', '— Select color —', ''], ['#000000','black','黒'],['#808080','gray','グレー'],['#FFFFFF','white','白'],
['#FF0000','red','赤'],['#FF7F00','orange','オレンジ'],['#FFFF00','yellow','黄'],
['#9ACD32','yellowgreen','黄緑'],['#00FF00','lime','ライム'],['#008000','green','緑'],
['#00FFFF','cyan','シアン'],['#00CED1','darkturquoise','ターコイズ'],['#40E0D0','turquoise','エメラルド'],
['#87CEEB','skyblue','スカイブルー'],['#0000FF','blue','青'],['#000080','navy','ネイビー'],
['#4B0082','indigo','インディゴ'],['#800080','purple','紫'],['#8A2BE2','blueviolet','ブルーバイオレット'],
['#FF00FF','magenta','マゼンタ'],['#FF69B4','pink','ピンク'], ['#A52A2A','brown','茶'],['#8B4513','saddlebrown','濃い茶'], ['#FFD700','gold','ゴールド'],['#F5DEB3','wheat','小麦色'],
];

function colorLabel(hex){ if(!hex) return ''; const hit = COLOR_24.find(([h]) => h.toUpperCase() === hex.toUpperCase()); return hit ? `${hit[1]}${hit[2] ? ` / ${hit[2]}` : ''}` : ''; }
function toHexColor(v){ const s = (v||'').toString().trim(); if(!s) return ''; const d = document.createElement('div'); d.style.color = s; document.body.appendChild(d); const m = getComputedStyle(d).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); document.body.removeChild(d); if(!m) return ''; return '#'+[m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,'0')).join('').toUpperCase(); }
function withInvestigating(v){ const s = (v ?? '').toString().trim(); return s === '' ? '--調査中--' : s; }
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function validateEdited(data){
const errors={};
if ((data.appearance||'').length>1000) errors.appearance='1000文字以内で入力してください。';
if ((data.memo||'').length>1000) errors.memo='1000文字以内で入力してください。';
const appTa=$id('edit-appearance'); const appErr=$id('appearance-error'); if(appTa) appTa.classList.toggle('invalid', !!errors.appearance); if(appErr) appErr.style.display=errors.appearance?'':'none';
const memoTa=$id('edit-memo'); const memoErr=$id('memo-error'); if(memoTa) memoTa.classList.toggle('invalid', !!errors.memo); if(memoErr) memoErr.style.display=errors.memo?'':'none';
return { ok:Object.keys(errors).length===0, errors };
}
function refreshSaveState(){ const saveBtn=$id('edit-save'); if(!saveBtn || !tempEdited) return; const {ok}=validateEdited(tempEdited); saveBtn.disabled=!ok; }
function buildPayload(){ const out = JSON.parse(JSON.stringify(characters)); if (tempEdited){ const idx = out.findIndex(c=>c.id===tempEdited.id); if (idx>=0) out[idx]=JSON.parse(JSON.stringify(tempEdited)); } return { characters: out }; }
async function onSaveClick(){ if(!tempEdited) return; const {ok}=validateEdited(tempEdited); if(!ok){ alert('未入力や不正な入力があります。赤枠をご確認ください。'); return; } const btn=$id('edit-save'); const prev=btn.textContent; btn.disabled=true; btn.setAttribute('aria-busy','true'); btn.textContent='保存中…'; const p = tempEdited.profile || {}; const payload = { id: tempEdited.id, series: Array.isArray(tempEdited.series) ? tempEdited.series : asSeriesArray(tempEdited), profile: { '住んでいるところ': withInvestigating(p['住んでいるところ']), '好きなもの・こと': withInvestigating(p['好きなもの・こと']), 'イメージカラー': withInvestigating(p['イメージカラー'] || '') }, appearance: withInvestigating(tempEdited.appearance || ''), memo: withInvestigating(tempEdited.memo || '') };
try{ await apiPatchCharacter(payload); const id=tempEdited.id; await reloadDataFresh(id); exitEditMode(); showDetail(); showToast('保存しました'); } catch(e){ console.error(e); if(String(e).includes('401')) showToast('パスワードが違います','err'); else showToast('保存に失敗しました','err'); } finally{ btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=prev; } }


function showToast(msg, type='ok'){
if (!document.getElementById('toast-style')){ const style=document.createElement('style'); style.id='toast-style'; style.textContent=`.toast{position:fixed;right:16px;top:16px;z-index:3000;display:flex;flex-direction:column;gap:8px}.toast-item{padding:10px 12px;border-radius:10px;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:14px}.toast-ok{background:#16a34a}.toast-err{background:#ef4444}`; document.head.appendChild(style);} let root=document.querySelector('.toast'); if(!root){ root=document.createElement('div'); root.className='toast'; document.body.appendChild(root);} const el=document.createElement('div'); el.className=`toast-item toast-${type==='err'?'err':'ok'}`; el.textContent=msg; root.appendChild(el); setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; }, 1600); setTimeout(()=>{ el.remove(); }, 2100); }


// ====== boot ======
document.addEventListener('DOMContentLoaded', ()=>{
const build = document.querySelector('meta[name="app-build"]')?.content || 'dev';
let pill = $id('version-pill'); if (!pill){ pill=document.createElement('div'); pill.id='version-pill'; pill.className='version-pill'; document.body.appendChild(pill);} pill.textContent = `build: ${build}`; pill.style.cursor = 'pointer'; pill.title='クリックでこのビルド番号をクエリに付けて再読み込み'; pill.addEventListener('click', ()=>{ const url = new URL(location.href); url.searchParams.set('b', build); location.href = url.toString(); });
setupCardLazyLoader();
loadData();
loadPalettes();
});

// ====== palette (既存) ======
async function loadPalettes(){ try{ const res = await fetch('data/palettes.json?v=' + Date.now(), { cache:'no-store' }); if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`); const palettes = await res.json(); renderPaletteList(palettes); const savedKey = localStorage.getItem('theme.palette.key'); const initial = palettes.find(p=>p.key===savedKey) || palettes[0]; applyPalette(initial); }catch(e){ console.error('パレット読み込み失敗:', e); } }
function applyPalette(p){ if (!p) return; const root=document.documentElement; root.style.setProperty('--base-color', p.base); root.style.setProperty('--accent-color', p.accent); root.style.setProperty('--sub-color', p.sub); localStorage.setItem('theme.palette.key', p.key); }
function renderPaletteList(palettes){ const panel=$id('palette-panel'); panel.innerHTML=''; palettes.forEach(p=>{ const item=document.createElement('div'); item.className='palette-item'; item.innerHTML = `<div class="palette-name">${p.name}</div><div class="palette-bars" style="--base-color:${p.base};--accent-color:${p.accent};--sub-color:${p.sub}"><span></span><span></span><span></span></div>`; item.addEventListener('click', ()=>{ applyPalette(p); panel.hidden = true; }); panel.appendChild(item); }); const btn=$id('palette-btn'); btn.onclick = (e)=>{ e.stopPropagation(); panel.hidden = !panel.hidden; }; document.addEventListener('click', (e)=>{ if(!panel.hidden && !panel.contains(e.target) && e.target!==btn) panel.hidden = true; }); }

/* === Quickfix pack: list/detail & lazy === */

/** カード背景の遅延読込（簡易版） */
function setupCardLazyLoader(){
  if (ioCardBg) return; // 1回だけ
  ioCardBg = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if (!en.isIntersecting) return;
      const el = en.target;
      const src = el.dataset.bg;
      if (src){ el.style.backgroundImage = `url("${src}")`; el.removeAttribute('data-bg'); }
      ioCardBg.unobserve(el);
    });
  }, { rootMargin: '200px' });
}

/** series を配列化 */
function asSeriesArray(c){
  if (Array.isArray(c.series)) return c.series;
  const s = (c.series ?? '').toString();
  return s ? s.split(/[,\s]+/).filter(Boolean) : [];
}

/** id昇順で並べ替え */
function sortCharacters(list){
  return [...list].sort((a,b)=>{
    const na = parseInt((a.id||'').replace(/\D/g,'')) || 0;
    const nb = parseInt((b.id||'').replace(/\D/g,'')) || 0;
    return na - nb;
  });
}

/** 現在の条件で再描画 */
function applyFilters(){
  const kw = (keyword||'').trim();
  const re = kw ? new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') : null;

  filteredCharacters = sortCharacters(characters).filter(c=>{
    // series
    if (activeSeries && activeSeries !== 'all') {
      const arr = asSeriesArray(c);
      if (!arr.includes(activeSeries)) return false;
    }
    // 調査中/調査済
    if (statusFilter === 'wip'  && !isPending(c)) return false;
    if (statusFilter === 'done' &&  isPending(c)) return false;

    // キーワード（id, name, プロフィール, 見た目, メモのどれかにヒット）
    if (re){
      const p = c.profile || {};
      const hay = [
        c.id, c.name,
        p['住んでいるところ']||'',
        p['好きなもの・こと']||'',
        p['イメージカラー']||'',
        c.appearance||'',
        c.memo||''
      ].join('\n');
      if (!re.test(hay)) return false;
    }
    return true;
  });

  renderList(filteredCharacters);
  renderSummaryBar();
}

/** 一覧を描画 */
function renderList(list){
  const wrap = $id('card-list');
  if (!wrap) return;
  wrap.innerHTML = '';

  list.forEach((c, idx)=>{
    const card = document.createElement('article');
    card.className = 'char-card';

    // 画像（あれば）
    const img = document.createElement('img');
    img.alt = c.name || '';
    img.src = imgSrcFor(c.id);
    setFallbackOnError(img);

    // 背景（遅延セット用）
    const bg = document.createElement('div');
    bg.className = 'card-bg';
    // 小さめ背景があれば優先して試す
    const bgCand = bgCandidates(c.id);
    bg.dataset.bg = bgCand[2] || bgCand[1] || bgCand[0] || ''; // 400→800→1600
    if (ioCardBg) ioCardBg.observe(bg);

    const title = document.createElement('h3');
    title.textContent = `${c.id}. ${c.name}`;

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const series = asSeriesArray(c).join(' / ');
    meta.innerHTML = `
      <span class="series">${series || '—'}</span>
      <span class="status ${isPending(c)?'wip':'done'}">${isPending(c)?'調査中':'調査済'}</span>
    `;

    card.appendChild(bg);
    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(meta);

    card.addEventListener('click', ()=>{
      currentIndex = idx;
      showDetail();
    });

    wrap.appendChild(card);
  });

  // 一覧表示に切り替え
  $id('list-view')?.classList.remove('hidden');
  $id('detail-view')?.classList.add('hidden');
}

/** 詳細へ */
function showDetail(){
  if (!filteredCharacters.length) return;
  loadCharacter(currentIndex);
  $id('list-view')?.classList.add('hidden');
  $id('detail-view')?.classList.remove('hidden');
}

/** 一覧へ */
function showList(){
  $id('detail-view')?.classList.add('hidden');
  $id('list-view')?.classList.remove('hidden');
}

/** 指定indexのキャラを詳細に描画 */
function loadCharacter(idx){
  const c = filteredCharacters[idx];
  if (!c) return;

  // ヒーロー画像
  const img = $id('detail-img');
  if (img){
    img.src = imgSrcFor(c.id);
    img.alt = c.name || '';
    setFallbackOnError(img);
  }

  // 背景（候補を上から順に試す）
  const bg = $id('detail-bg');
  if (bg){
    const cand = bgCandidates(c.id);
    let tried = 0;
    const tryNext = ()=>{
      if (tried >= cand.length){ bg.removeAttribute('src'); return; }
      const url = cand[tried++]; if (!url){ tryNext(); return; }
      bg.onerror = tryNext; bg.onload = ()=>{ bg.onerror = null; };
      bg.src = url;
    };
    tryNext();
  }

  // summary / profile / appearance / memo
  const p = c.profile || {};
  $id('character-summary').innerHTML = `
    <p>No.${c.id}</p>
    <h2>${c.name}</h2>
    <div class="tags">${asSeriesArray(c).map(s=>`<span class="tag">${s}</span>`).join('')}</div>
  `;
  $id('profile').innerHTML = `
    <h3>プロフィール</h3>
    <div>住んでいるところ：${withInvestigating(p['住んでいるところ']||'')}</div>
    <div>好きなもの・こと：${withInvestigating(p['好きなもの・こと']||'')}</div>
    <div>イメージカラー：${withInvestigating(p['イメージカラー']||'')}</div>
  `;
  $id('appearance').innerHTML = `<h3>見た目</h3><p>${withInvestigating(c.appearance||'')}</p>`;
  $id('memo').innerHTML       = `<h3>メモ</h3><p>${withInvestigating(c.memo||'')}</p>`;
}

/** サマリー（件数とバー） */
function renderSummaryBar(){
  const total = characters.length;
  const done  = characters.filter(c=>!isPending(c)).length;
  const wip   = total - done;

  // pill 数字
  $id('sum-count-done') && ($id('sum-count-done').textContent = String(done));
  $id('sum-count-wip')  && ($id('sum-count-wip').textContent  = String(wip));
  $id('sum-txt-total')  && ($id('sum-txt-total').textContent  = String(total));
  $id('sum-txt-done')   && ($id('sum-txt-done').textContent   = String(done));
  $id('sum-txt-wip')    && ($id('sum-txt-wip').textContent    = String(wip));
  $id('sum-txt-rate')   && ($id('sum-txt-rate').textContent   = total? Math.round(done*100/total)+'%' : '0%');

  // プログレス（幅）
  const doneW = total? (done*100/total) : 0;
  const wipW  = total? (wip*100/total)  : 0;
  $id('sum-bar-done') && ($id('sum-bar-done').style.width = doneW + '%');
  $id('sum-bar-wip')  && ($id('sum-bar-wip').style.width  = wipW  + '%');
}

/* クリックで「調査済/調査中」ピルによるフィルタ（任意） */
$id('sum-pill-done')?.addEventListener('click', ()=>{
  statusFilter = (statusFilter==='done') ? null : 'done';
  document.getElementById('sum-pill-done').setAttribute('aria-pressed', String(statusFilter==='done'));
  document.getElementById('sum-pill-wip')?.setAttribute('aria-pressed','false');
  applyFilters();
});
$id('sum-pill-wip')?.addEventListener('click', ()=>{
  statusFilter = (statusFilter==='wip') ? null : 'wip';
  document.getElementById('sum-pill-wip').setAttribute('aria-pressed', String(statusFilter==='wip'));
  document.getElementById('sum-pill-done')?.setAttribute('aria-pressed','false');
  applyFilters();
});
$id('sum-clear')?.addEventListener('click', ()=>{
  statusFilter = null; applyFilters();
});
/* === /Quickfix pack === */
