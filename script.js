// ====== state ======
let characters = [];
let filteredCharacters = [];
let currentIndex = 0;
let activeSeries = 'all';
let keyword = '';
let tempEdited = null; // 編集ワーク
let statusFilter = null;//調査状況フィルタ（null | 'wip' | 'done'）
let adminSecret = ''; // 入力された管理パスワードを保持（X-Admin-Secretに使う）
const $id = (id) => document.getElementById(id);  // 衝突しにくいIDヘルパ

// ====== helpers (images / bg / fallback) ======
function imgSrcFor(id){ return `images/${id}.png`; }
function bgSrcFor(id){  return `images/bg${id}.png`; }
function setFallbackOnError(imgEl){
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = 'images/placeholder.png'; };
}
function trySetSectionBg(id){
  const sec = document.querySelector('.section-top');
  if (!sec) return;
  const url = bgSrcFor(id);
  const test = new Image();
  test.onload  = () => { sec.style.backgroundImage = `url('${url}')`; };
  test.onerror = () => { sec.style.backgroundImage = ''; };
  test.src = url;
}
function isInvestigating(chara){
  const NEEDLE = '調査中'; // ←ココだけでOK（--調査中-- も ーー調査中ーー も拾える）
  // 文字列候補を全部かき集めてチェック
  const arr = [];
  if (chara.name) arr.push(chara.name);
  if (chara.series) arr.push(Array.isArray(chara.series) ? chara.series.join('、') : chara.series);
  if (chara.appearance) arr.push(chara.appearance);
  if (chara.memo) arr.push(chara.memo);
  if (chara.profile) {
    Object.values(chara.profile).forEach(v => { if (typeof v === 'string') arr.push(v); });
  }
  return arr.some(s => typeof s === 'string' && s.includes(NEEDLE));
}

// ====== sort: Series -> No ======
const SERIES_ORDER = { 'ねこニャ町':0, '四角丸町':1, 'にじいろ学校':2 };
function sortCharacters(arr){
  return arr.slice().sort((a,b)=>{
    const sa = SERIES_ORDER[asSeriesText(a)] ?? 99;
    const sb = SERIES_ORDER[asSeriesText(b)] ?? 99;
    if (sa !== sb) return sa - sb;
    return parseInt(a.id,10) - parseInt(b.id,10);
  });
}
function asSeriesArray(c){
  return Array.isArray(c.series) ? c.series : (c.series ? [c.series] : []);
}
function asSeriesText(c){
  const arr = asSeriesArray(c);
  return arr[0] ?? ''; // 並び用の先頭
}
function seriesIncludes(c, value){
  return asSeriesArray(c).includes(value);
}
function seriesTextForView(c){
  const arr = asSeriesArray(c);
  return arr.join('、');
}
const VERCEL_ORIGIN = "https://kanako-charactor-library.vercel.app";
const API_ORIGIN = location.hostname.endsWith("vercel.app") ? location.origin : VERCEL_ORIGIN;

// ====== data load ======
async function loadData(){
  try{
    const res = await fetch(`${API_ORIGIN}/api/characters`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    characters = await res.json();
    filteredCharacters = sortCharacters(characters);
    renderList(filteredCharacters);
    wireHeaderHandlers();
    renderSummaryBar();
  }catch(e){
    console.error('API読み込みに失敗:', e);
    alert('APIからの読み込みに失敗しました。');
  }
}
async function apiPatchCharacter(payload){
  const url = `${API_ORIGIN}/api/characters`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret // モーダルで入力された値
    },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const text = await res.text().catch(()=> '');
    throw new Error(`PATCH ${res.status} ${text}`);
  }
  return res.json();
}

// ====== list ======
function renderList(list){
  const container = document.getElementById('list-container');
  container.innerHTML = '';
  sortCharacters(list).forEach((chara, index)=>{
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <img alt="${chara.name}">
      <div class="card-body">
        <p>No.${chara.id}</p>
        <h3>${chara.name}</h3>
        <p>${seriesTextForView(chara)}</p>
      </div>`;
    const img = card.querySelector('img');
    img.src = imgSrcFor(chara.id);
    setFallbackOnError(img);
    card.addEventListener('click', ()=>{ currentIndex = index; showDetail(); });
    container.appendChild(card);
  });
}

// ====== detail ======
function loadCharacter(index=0){
  const data = filteredCharacters[index];
  if (!data) return;

  const mainImg = document.getElementById('character-image');
  mainImg.src = imgSrcFor(data.id);
  setFallbackOnError(mainImg);
  trySetSectionBg(data.id);

  document.getElementById('character-summary').innerHTML = `
    <p>No.${data.id}</p>
    <h2>${data.name}</h2>
    <p>シリーズ：${seriesTextForView(data)}</p>`;

document.getElementById('profile').innerHTML = `
  <h3>プロフィール</h3>
  <p>住んでいるところ: ${data.profile['住んでいるところ']||''}</p>
  <p>好きなもの・こと: ${data.profile['好きなもの・こと']||''}</p>
  <p>イメージカラー:
    <span class="color-dot" style="background:${(data.profile['イメージカラー']||'').toLowerCase()}"></span>
  </p>`;

  document.getElementById('appearance').innerHTML = `
    <h3>見た目</h3>
    <p>${data.appearance||''}</p>`;

  document.getElementById('memo').innerHTML = `<p>${data.memo||''}</p>`;
}

function showDetail(){
  document.getElementById('list-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');
  document.body.classList.add('detail-mode');

  loadCharacter(currentIndex);
}
function showList(){
  document.getElementById('detail-view').classList.add('hidden');
  document.getElementById('list-view').classList.remove('hidden');
  document.body.classList.remove('detail-mode');

}

// ====== filter/search (series配列対応) ======
function applyFilters(){
  const kw = keyword.trim().toLowerCase();
  filteredCharacters = characters.filter(c=>{
    // シリーズ（複数対応）
    const hitSeries =
      activeSeries === 'all' ||
      (Array.isArray(c.series) ? c.series.includes(activeSeries) : c.series === activeSeries);

    // 検索
    const kwHit = kw === '' ||
      (c.name && c.name.toLowerCase().includes(kw)) ||
      (Array.isArray(c.series) ? c.series.join('、').toLowerCase().includes(kw) : (c.series||'').toLowerCase().includes(kw)) ||
      ((c.memo||'').toLowerCase().includes(kw)) ||
      ((c.appearance||'').toLowerCase().includes(kw)) ||
      (c.profile && Object.values(c.profile).some(v => String(v).toLowerCase().includes(kw)));

    const statusOK =
      !statusFilter ||
      (statusFilter === 'wip'  ? isInvestigating(c) : !isInvestigating(c));

    return hitSeries && kwHit && statusOK;
  });
  filteredCharacters = sortCharacters(filteredCharacters);
  renderList(filteredCharacters);
  renderSummaryBar();
}
// ====== 調査状況サマリーバー描画 ======
function renderSummaryBar(){
  if (!Array.isArray(characters) || characters.length === 0) return;

  // 集計（全体ベース）
  const total = characters.length;
  const done  = characters.filter(c => !isInvestigating(c)).length;
  const wip   = total - done;
  const rate  = total ? Math.round((done/total)*100) : 0;

  // 要素参照
  const $ = id => document.getElementById(id);
  const el = {
    total: $('sum-txt-total'), done: $('sum-txt-done'), wip: $('sum-txt-wip'), rate: $('sum-txt-rate'),
    cDone: $('sum-count-done'), cWip: $('sum-count-wip'),
    barDone: $('sum-bar-done'), barWip: $('sum-bar-wip'),
    pillDone: $('sum-pill-done'), pillWip: $('sum-pill-wip'),
    clear: $('sum-clear')
  };
  if (!el.total) return; // まだDOM未挿入のとき

  // 数字
  el.total.textContent = total;
  el.done.textContent  = done;
  el.wip.textContent   = wip;
  el.rate.textContent  = rate + '%';
  el.cDone.textContent = done;
  el.cWip.textContent  = wip;

  // バー（2色セグメント）
  el.barDone.style.width = rate + '%';
  el.barWip.style.width  = (100 - rate) + '%';

  // フィルタ状態の強調
  const mode = statusFilter; // null | 'wip' | 'done'
//
  el.pillDone.setAttribute('aria-pressed', String(mode === 'done'));
  el.pillWip .setAttribute('aria-pressed', String(mode === 'wip'));
  el.barDone.style.opacity = (mode === 'wip') ? .35 : 1;
  el.barWip .style.opacity = (mode === 'done') ? .35 : 1;
  el.clear.hidden = (mode === null);

  // ピル: 調査済
  if (!el.pillDone.dataset.bound){
    el.pillDone.addEventListener('click', ()=>{
      statusFilter = (statusFilter === 'done') ? null : 'done';
      applyFilters();
    });
    el.pillDone.dataset.bound = '1';
  }

  // ピル: 調査中
  if (!el.pillWip.dataset.bound){
    el.pillWip.addEventListener('click', ()=>{
      statusFilter = (statusFilter === 'wip') ? null : 'wip';
      applyFilters();
    });
    el.pillWip.dataset.bound = '1';
  }

  // クリア
  if (!el.clear.dataset.bound){
    el.clear.addEventListener('click', ()=>{
      statusFilter = null;
      applyFilters();
    });
    el.clear.dataset.bound = '1';
  }
}


function filterBySeries(series){
  activeSeries = series==='all' ? 'all' : series;
  applyFilters();
}
function searchCharacter(v){
  keyword = (v||'').toLowerCase();
  applyFilters();
}

// ====== nav ======
function showNext(){ currentIndex = (currentIndex+1) % filteredCharacters.length; loadCharacter(currentIndex); }
function showPrev(){ currentIndex = (currentIndex-1+filteredCharacters.length) % filteredCharacters.length; loadCharacter(currentIndex); }

// ====== palette ======
async function loadPalettes(){
  try{
    const res = await fetch('data/palettes.json?v=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
    const palettes = await res.json();
    renderPaletteList(palettes);
    const savedKey = localStorage.getItem('theme.palette.key');
    const initial = palettes.find(p=>p.key===savedKey) || palettes[0];
    applyPalette(initial);
  }catch(e){ console.error('パレット読み込み失敗:', e); }
}
function applyPalette(p){
  if (!p) return;
  const root = document.documentElement;
  root.style.setProperty('--base-color', p.base);
  root.style.setProperty('--accent-color', p.accent);
  root.style.setProperty('--sub-color', p.sub);
  localStorage.setItem('theme.palette.key', p.key);
}
function renderPaletteList(palettes){
  const panel = document.getElementById('palette-panel');
  panel.innerHTML = '';
  palettes.forEach(p=>{
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.innerHTML = `
      <div class="palette-name">${p.name}</div>
      <div class="palette-bars" style="--base-color:${p.base};--accent-color:${p.accent};--sub-color:${p.sub}">
        <span></span><span></span><span></span>
      </div>`;
    item.addEventListener('click', ()=>{ applyPalette(p); panel.hidden = true; });
    panel.appendChild(item);
  });
  const btn = document.getElementById('palette-btn');
  btn.onclick = (e)=>{ e.stopPropagation(); panel.hidden = !panel.hidden; };
  document.addEventListener('click', (e)=>{ if(!panel.hidden && !panel.contains(e.target) && e.target!==btn) panel.hidden = true; });
}

// ====== edit UI (UIだけ・保存モック) ======
let isEditing = false;

function enterEditMode(){
  isEditing = true;
  document.body.classList.add('is-editing');
  // まだリスト表示なら、詳細ビューを開く（編集UIを出す前提を整える）
  const detail = document.getElementById('detail-view');
  if (detail && detail.classList.contains('hidden')) {
    showDetail();
  }
  tempEdited = JSON.parse(JSON.stringify(filteredCharacters[currentIndex]));
  renderEditableFields(); // ← 詳細が開いている前提で必ず描画
  const btn = document.getElementById('edit-btn'); if (btn) btn.textContent = '編集終了';
  document.getElementById('edit-actions').hidden = false;
  refreshSaveState();
}
function exitEditMode(){
  isEditing = false;
  document.body.classList.remove('is-editing');
  tempEdited = null;
  if (!document.getElementById('detail-view').classList.contains('hidden')) loadCharacter(currentIndex);
  const btn = document.getElementById('edit-btn'); if (btn) btn.textContent = '✎';
  document.getElementById('edit-actions').hidden = true;
}

function renderEditableFields(){
  const data = tempEdited || filteredCharacters[currentIndex] || {};
  const allSeries = Array.from(new Set(characters.flatMap(c=>asSeriesArray(c)))).filter(Boolean);
  if (!Array.isArray(data.series)) data.series = asSeriesArray(data);

  const summary = document.getElementById('character-summary');
  summary.innerHTML = `
    <p>No.${data.id}</p>
    <h2>${data.name}</h2>
    <label>シリーズ：</label>
    <div class="tags" id="series-tags"></div>
    <div class="tag-input">
      <input id="series-input" list="series-datalist" placeholder="シリーズを追加（Enter）">
      <datalist id="series-datalist">
        ${allSeries.map(s=>`<option value="${s}">`).join('')}
      </datalist>
    </div>
    <div id="series-error" class="field-error" style="display:none;">シリーズを1つ以上選んでください。</div>
  `;
  function renderSeriesTags(){
    const wrap = document.getElementById('series-tags'); wrap.innerHTML = '';
    (data.series||[]).forEach(s=>{
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${s}<span class="remove" title="削除">✕</span>`;
      el.querySelector('.remove').onclick = ()=>{ data.series = data.series.filter(x=>x!==s); renderSeriesTags(); refreshSaveState(); };
      wrap.appendChild(el);
    });
  }
  renderSeriesTags();
  const seriesInput = document.getElementById('series-input');
  seriesInput.addEventListener('keydown', (e)=>{
    if (e.key==='Enter'){
      const v = seriesInput.value.trim();
      if (v && !data.series.includes(v)){ data.series.push(v); renderSeriesTags(); seriesInput.value=''; refreshSaveState(); }
      e.preventDefault();
    }
  });
  data.profile ||= {};

  // ===== プロフィール（住・好き・色 24色セレクト） =====
  const nowHex = toHexColor(data.profile['イメージカラー']);
  const options = COLOR_24.map(([hex,label])=>{
    const sel = (hex && nowHex && hex.toUpperCase()===nowHex) ? ' selected' : '';
    return `<option value="${hex}"${sel}>${label}</option>`;
  }).join('');
  $id('profile').innerHTML = `
    <h3>プロフィール</h3>
    <label>住んでいるところ：
      <input id="edit-home" class="edit-field" value="${escapeHtml(data.profile['住んでいるところ']||'')}">
    </label><br><br>
    <label>好きなもの・こと：
      <input id="edit-like" class="edit-field" value="${escapeHtml(data.profile['好きなもの・こと']||'')}">
    </label><br><br>
    <label>イメージカラー：
      <select id="edit-color" class="edit-field">${options}</select>
      <span class="color-dot" id="edit-color-dot" style="background:${nowHex || 'transparent'}"></span>
    </label>
  `;


  // イベント（プロフィール）
  $id('edit-home')?.addEventListener('input', e=>{
    data.profile['住んでいるところ'] = e.target.value; refreshSaveState();
  });
  $id('edit-like')?.addEventListener('input', e=>{
    data.profile['好きなもの・こと'] = e.target.value; refreshSaveState();
  });
  $id('edit-color')?.addEventListener('change', e=>{
    const hex = e.target.value;               // '' or #rrggbb
    data.profile['イメージカラー'] = hex || '';
    const dot = $id('edit-color-dot'); if (dot) dot.style.background = hex || 'transparent';
    refreshSaveState();
  });
  // ===== 見た目 =====
  $id('appearance').innerHTML = `
    <h3>見た目</h3>
    <textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>
  `;
  $id('edit-appearance')?.addEventListener('input', e=>{
    data.appearance = e.target.value; refreshSaveState();
  });

  // ===== メモ =====
  $id('memo').innerHTML = `
    <h3>メモ</h3>
    <textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>
  `;
  $id('edit-memo')?.addEventListener('input', e=>{
    data.memo = e.target.value; refreshSaveState();
  });

}
// 24色の定義（ラベル → #hex）
const COLOR_24 = [
  ['','—選択してください—'],
  ['#000000','黒'],['#808080','グレー'],['#FFFFFF','白'],
  ['#FF0000','赤'],['#FF7F00','オレンジ'],['#FFFF00','黄'],
  ['#9ACD32','黄緑'],['#00FF00','ライム'],['#008000','緑'],
  ['#00FFFF','シアン'],['#00CED1','ターコイズ'],['#40E0D0','エメラルド'],
  ['#87CEEB','スカイブルー'],['#0000FF','青'],['#000080','ネイビー'],
  ['#4B0082','インディゴ'],['#800080','紫'],['#8A2BE2','ブルーバイオレット'],
  ['#FF00FF','マゼンタ'],['#FF69B4','ピンク'],
  ['#A52A2A','茶'],['#8B4513','濃い茶'],
  ['#FFD700','ゴールド'],['#F5DEB3','小麦色'],
];
// 任意のCSS色を #rrggbb に正規化（失敗時は ''）
function toHexColor(v){
  const s = (v||'').toString().trim(); if(!s) return '';
  const d = document.createElement('div'); d.style.color = s; document.body.appendChild(d);
  const m = getComputedStyle(d).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  document.body.removeChild(d);
  if(!m) return '';
  return '#'+[m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,'0')).join('').toUpperCase();
}

// 空欄なら "--調査中--" に置換
function withInvestigating(v){
  const s = (v ?? '').toString().trim();
  return s === '' ? '--調査中--' : s;
}

// validation / save mock
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function colorOptions(selected){
  const colors=["black","white","gray","silver","red","crimson","tomato","coral","orange","gold","yellow","khaki","olive","green","seagreen","lime","teal","cyan","skyblue","deepskyblue","blue","navy","indigo","purple","violet","magenta","pink","brown","chocolate","sienna"];
  return colors.map(c=>`<option value="${c}" ${c===selected?'selected':''}>${c}</option>`).join('');
}
function validateEdited(data){
  const errors={};
  // type=color は常に #rrggbb を返す。空欄扱いは保存時に "--調査中--" へ置換。
  const color = (data.profile?.['イメージカラー']||'');
  if ((data.appearance||'').length>1000) errors.appearance='1000文字以内で入力してください。';
  if ((data.memo||'').length>1000) errors.memo='1000文字以内で入力してください。';

  // UI反映
  const colorSel=document.getElementById('edit-color'); const colorErr=document.getElementById('color-error');
  if(colorSel) colorSel.classList.toggle('invalid', !!errors.color);
  if(colorErr) colorErr.textContent = errors.color||''; if(colorErr) colorErr.style.display = errors.color?'':'none';

  const appTa=document.getElementById('edit-appearance'); const appErr=document.getElementById('appearance-error');
  if(appTa) appTa.classList.toggle('invalid', !!errors.appearance); if(appErr) appErr.style.display=errors.appearance?'':'none';
  const memoTa=document.getElementById('edit-memo'); const memoErr=document.getElementById('memo-error');
  if(memoTa) memoTa.classList.toggle('invalid', !!errors.memo); if(memoErr) memoErr.style.display=errors.memo?'':'none';

  return { ok:Object.keys(errors).length===0, errors };
}

function refreshSaveState(){
  const saveBtn=document.getElementById('edit-save');
  if(!saveBtn || !tempEdited) return;
  const {ok}=validateEdited(tempEdited);
  saveBtn.disabled=!ok;
}
function buildPayload(){
  const out = JSON.parse(JSON.stringify(characters));
  if (tempEdited){
    const idx = out.findIndex(c=>c.id===tempEdited.id);
    if (idx>=0) out[idx]=JSON.parse(JSON.stringify(tempEdited));
  }
  return { characters: out };
}
// PWを要求してadminSecretをセット。モーダルがなければpromptで代替
function requestAdminSecret(){
  return new Promise((resolve, reject)=>{
    if (adminSecret) return resolve(adminSecret);

    const modal  = $id('pw-modal') || $id('password-modal');
    const input  = $id('pw-input') || $id('password-input');
    const okBtn  = $id('pw-ok')    || $id('password-ok');
    const cancel = $id('pw-cancel')|| $id('password-cancel');

    if (modal && input && okBtn){
      // モーダル方式
      modal.style.display = 'block';
      input.value = '';
      input.focus();

      const onOk = () => {
        const v = input.value.trim();
        if(!v){ ( $id('pw-error') || {} ).textContent = 'パスワードを入力してください'; return; }
        adminSecret = v;
        cleanup();
        resolve(adminSecret);
      };
      const onCancel = () => { cleanup(); reject('cancel'); };

      function cleanup(){
        okBtn.removeEventListener('click', onOk);
        cancel?.removeEventListener('click', onCancel);
        modal.style.display = 'none';
      }

      okBtn.addEventListener('click', onOk);
      cancel?.addEventListener('click', onCancel);
    } else {
      // フォールバック：prompt
      const s = window.prompt('管理パスワードを入力');
      if (!s) return reject('empty');
      adminSecret = s.trim();
      resolve(adminSecret);
    }
  });
}
// ====== header wiring & boot ======
function wireHeaderHandlers(){
  const buttons = document.querySelectorAll('.filter-buttons button');
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      filterBySeries(btn.textContent==='全シリーズ' ? 'all' : btn.textContent);
    });
  });
  document.querySelector('.search-box').addEventListener('input', e=>searchCharacter(e.target.value));

  // 編集モーダル
  const editBtn    = document.getElementById('edit-btn');
  const pwBackdrop = document.getElementById('pw-backdrop');
  const pwModal    = document.getElementById('pw-modal');
  const pwInput    = document.getElementById('pw-input');
  const pwOk       = document.getElementById('pw-ok');
  const pwCancel   = document.getElementById('pw-cancel');
  const pwError    = document.getElementById('pw-error');

  editBtn?.addEventListener('click', ()=>{
    if (isEditing){ exitEditMode(); return; }
    pwError.hidden = true; pwInput.value=''; pwBackdrop.hidden=false; pwModal.hidden=false; setTimeout(()=>pwInput.focus(),0);
  });
  function closePwModal(){ pwBackdrop.hidden=true; pwModal.hidden=true; }
  pwCancel?.addEventListener('click', closePwModal);
  pwBackdrop?.addEventListener('click', closePwModal);
  pwOk?.addEventListener('click', ()=>{
    if (!pwInput.value.trim()){
      pwError.hidden = false;
      pwError.textContent = 'パスワードを入力してください。';
      return;
    }
    adminSecret = pwInput.value.trim(); // ← 入力を保持（ソースにハードコードしない）
    pwError.hidden = true;
    closePwModal();
    enterEditMode();
  });
  pwInput?.addEventListener('keydown', e=>{ if(e.key==='Enter') pwOk.click(); if(e.key==='Escape') closePwModal(); });

  // 保存/取消（モック）
document.getElementById('edit-save')?.addEventListener('click', async ()=>{
  if(!tempEdited) return;
  const {ok} = validateEdited(tempEdited);
  if(!ok){ alert('未入力や不正な入力があります。赤枠をご確認ください。'); return; }

  // 空欄は "--調査中--" に置換してpayloadを構築
  const p = tempEdited.profile || {};
  const payload = {
    id: tempEdited.id,
    series: Array.isArray(tempEdited.series) ? tempEdited.series : asSeriesArray(tempEdited),
    profile: {
      '住んでいるところ': withInvestigating(p['住んでいるところ']),
      '好きなもの・こと': withInvestigating(p['好きなもの・こと']),
      'イメージカラー': withInvestigating(p['イメージカラー'] || '') // #rrggbb か "--調査中--"
    },
    appearance: withInvestigating(tempEdited.appearance || ''),
    memo: withInvestigating(tempEdited.memo || '')
  };

  try{
    const r = await apiPatchCharacter(payload);
    console.log('PATCH ok', r);

    // ローカル状態も更新
    const i = characters.findIndex(c=>c.id===tempEdited.id);
    if(i>=0){ characters[i] = JSON.parse(JSON.stringify(payload)); }
    filteredCharacters = sortCharacters(characters);
    exitEditMode();
    showDetail(); // 再描画
    alert('保存しました。');
  }catch(e){
    console.error(e);
    if(String(e).includes('401')) alert('パスワードが違います。（X-Admin-Secret）');
    else alert('保存に失敗しました。\n' + e.message);
  }
});
  document.getElementById('edit-cancel')?.addEventListener('click', ()=>{
    tempEdited = JSON.parse(JSON.stringify(filteredCharacters[currentIndex]));
    renderEditableFields(); refreshSaveState();
  });

// 調査中トグル
  const pendingBtn = document.getElementById('pending-toggle');
  if (pendingBtn) {
    pendingBtn.addEventListener('click', () => {
      const pressed = pendingBtn.getAttribute('aria-pressed') === 'true';
      const next = !pressed;
      pendingBtn.setAttribute('aria-pressed', String(next));
      statusFilter = next ? 'wip' : null;
      applyFilters();
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadData();
  loadPalettes();
  document.querySelector('.back-button').addEventListener('click', showList);
  document.querySelector('.nav-button.next').addEventListener('click', showNext);
  document.querySelector('.nav-button.prev').addEventListener('click', showPrev);
})
;
