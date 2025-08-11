let characters = [];
let filteredCharacters = [];
let currentIndex = 0;
let activeSeries = 'all';
let keyword = '';
let tempEdited = null; // 編集中だけ使うワーク

async function loadData() {
  try {
    const res = await fetch('data/characters.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTPエラー: ${res.status}`);
    }
    characters = await res.json();
    filteredCharacters = sortCharacters(characters);
    renderList(filteredCharacters);
    wireHeaderHandlers(); // ヘッダーの検索/絞り込みを接続
  } catch (e) {
    console.error('JSONの読み込みに失敗しました:', e);
    alert('データ読み込みエラー。JSONが存在するか、パスが正しいか確認してください。');
  }
}
// ===== キャラ詳細表示処理 =====
function loadCharacter(index = 0) {
  const data = filteredCharacters[index];
  if (!data) return;

  const mainImg = document.getElementById('character-image');
  mainImg.src = imgSrcFor(data.id);
  setFallbackOnError(mainImg);
  document.getElementById('character-summary').innerHTML = `
    <p>No.${data.id}</p>
    <h2>${data.name}</h2>
    <p>シリーズ：${data.series}</p>
  `;
  document.getElementById('profile').innerHTML = `
    <h3>プロフィール</h3>
    <p>住んでいるところ: ${data.profile["住んでいるところ"]}</p>
    <p>好きなもの・こと: ${data.profile["好きなもの・こと"]}</p>
    <p>イメージカラー:<span style="color:${data.profile["イメージカラー"]};">●</span></p>
  `;
  document.getElementById('appearance').innerHTML = `
    <h3>見た目</h3>
    <p>${data.appearance}</p>
  `;
  document.getElementById('memo').innerHTML = `<p>${data.memo}</p>`;
}

// ===== 一覧生成 =====
function renderList(charactersToRender) {
  charactersToRender = sortCharacters(charactersToRender);
  const container = document.getElementById('list-container');
  container.innerHTML = '';

  charactersToRender.forEach((chara, index) => {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
    <img src="${imgSrcFor(chara.id)}" alt="${chara.name}"></img>
      <div class="card-body">
        <p>No.${chara.id}</p>
        <h3>${chara.name}</h3>
        <p>${chara.series}</p>
      </div>
     `;
    card.addEventListener('click', () => {
      currentIndex = index;
      showDetail();
    });
    container.appendChild(card);
    const img = card.querySelector('img');
    setFallbackOnError(img);
  });
}

// ===== 詳細ビュー切り替え =====
function showDetail() {
  document.getElementById('list-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');
  loadCharacter(currentIndex);
}

function showList() {
  document.getElementById('detail-view').classList.add('hidden');
  document.getElementById('list-view').classList.remove('hidden');
}

// ===== イベント登録 =====
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  loadPalettes();

  document.querySelector('.back-button').addEventListener('click', showList);
  document.querySelector('.nav-button.next').addEventListener('click', showNext);
  document.querySelector('.nav-button.prev').addEventListener('click', showPrev);

  const saveBtn   = document.getElementById('edit-save');
  const cancelBtn = document.getElementById('edit-cancel');

  if (saveBtn) {
    saveBtn.addEventListener('click', ()=>{
      if (!tempEdited) return;
      const v = validateEdited(tempEdited);
      if (!v.ok) { alert('未入力や不正な入力があります。赤枠の項目をご確認ください。'); return; }

      // ここはモック：実際は /api/update-character にPOST予定
      const payload = buildPayload();
      console.log('[MOCK SAVE] payload =', payload);
      alert('保存モック：コンソールにpayloadを出力しました。');
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', ()=>{
      // 編集開始時の状態へ戻す
      const cur = filteredCharacters[currentIndex];
      tempEdited = JSON.parse(JSON.stringify(cur));
      renderEditableFields();
      refreshSaveState();
    });
  }



});
// 保存時のペイロード作成（将来API投げるときにそのまま使える形）
function buildPayload(){
  // 当面は characters 全体を丸ごと送る方式（“最後の勝ち”）
  const out = JSON.parse(JSON.stringify(characters));
  // 現在の編集を out へ反映（ID一致で置換）
  if (tempEdited) {
    const idx = out.findIndex(c=>c.id === tempEdited.id);
    if (idx >= 0) out[idx] = JSON.parse(JSON.stringify(tempEdited));
  }
  return { characters: out };
}
function applyFilters() {
  const kw = keyword.trim().toLowerCase();
  filteredCharacters = characters.filter(c =>
    (activeSeries === 'all' || c.series === activeSeries) &&
    (
      kw === '' ||
      c.name.toLowerCase().includes(kw) ||
      c.series.toLowerCase().includes(kw) ||
      (c.memo || '').toLowerCase().includes(kw)
    )
  );
  filteredCharacters = sortCharacters(filteredCharacters);
  renderList(filteredCharacters);
}

// ===== ナビゲーション（進む・戻る） =====
function showNext() {
  currentIndex = (currentIndex + 1) % filteredCharacters.length;
  loadCharacter(currentIndex);
}

function showPrev() {
  currentIndex = (currentIndex - 1 + filteredCharacters.length) % filteredCharacters.length;
  loadCharacter(currentIndex);
}

// ===== 絞り込み =====
function filterBySeries(series) {
  if (series === 'all') {
    filteredCharacters = [...characters];
  } else {
    filteredCharacters = characters.filter(chara => chara.series === series);
  }
  currentIndex = 0;
  loadCharacter(currentIndex);
}

// ===== 検索 =====
function searchCharacter(keyword) {
  keyword = keyword.trim().toLowerCase();
  filteredCharacters = characters.filter(chara =>
    chara.name.toLowerCase().includes(keyword) ||
    chara.series.toLowerCase().includes(keyword) ||
    chara.memo.toLowerCase().includes(keyword)
  );
  currentIndex = 0;
  loadCharacter(currentIndex);
}
// ===== Palette (theme) =====
async function loadPalettes() {
  try {
    const res = await fetch('data/palettes.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
    const palettes = await res.json();
    renderPaletteList(palettes);

    // 保存済みの選択 or 先頭を適用
    const savedKey = localStorage.getItem('theme.palette.key');
    const initial = palettes.find(p => p.key === savedKey) || palettes[0];
    applyPalette(initial);
  } catch (e) {
    console.error('パレットの読み込みに失敗しました:', e);
    // JSONが読めない場合でもアプリ自体は動くようにする（デフォルトCSS変数が効く）
  }
}

function applyPalette(palette) {
  if (!palette) return;
  const root = document.documentElement;
  root.style.setProperty('--base-color',   palette.base);
  root.style.setProperty('--accent-color', palette.accent);
  root.style.setProperty('--sub-color',    palette.sub);
  localStorage.setItem('theme.palette.key', palette.key);
}

function renderPaletteList(palettes) {
  const panel = document.getElementById('palette-panel');
  panel.innerHTML = '';

  palettes.forEach(p => {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.innerHTML = `
      <div class="palette-name">${p.name}</div>
      <div class="palette-bars" style="--base-color:${p.base};--accent-color:${p.accent};--sub-color:${p.sub}">
        <span></span><span></span><span></span>
      </div>
    `;
    item.addEventListener('click', () => {
      applyPalette(p);
      panel.hidden = true;
    });
    panel.appendChild(item);
  });

  // トグル動作
  const btn = document.getElementById('palette-btn');
  btn.onclick = (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  };

  // パネル外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });
}
// ヘッダー（絞り込み・検索）にイベントを貼る
function wireHeaderHandlers() {
  // 絞り込み
  const buttons = document.querySelectorAll('.filter-buttons button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSeries = (btn.textContent === '全シリーズ') ? 'all' : btn.textContent;
      applyFilters();
    });
  });

  // 検索
  document.querySelector('.search-box').addEventListener('input', (e) => {
    keyword = e.target.value;
    applyFilters();
  });
}
// 並び順：シリーズ → No.
const SERIES_ORDER = { 'ねこニャ町': 0, '四角丸町': 1, 'にじいろ学校': 2 };
function sortCharacters(arr) {
  return arr.slice().sort((a, b) => {
    const sa = SERIES_ORDER[a.series] ?? 99;
    const sb = SERIES_ORDER[b.series] ?? 99;
    if (sa !== sb) return sa - sb;
    return parseInt(a.id, 10) - parseInt(b.id, 10);
  });
}
// === 追加: 編集UIだけ（保存なし） ===
const ADMIN_PASSWORD = 'knk2525';
let isEditing = false;

// 鉛筆ボタン -> モーダル表示
document.addEventListener('DOMContentLoaded', () => {
  const editBtn = document.getElementById('edit-btn');
  const pwBackdrop = document.getElementById('pw-backdrop');
  const pwModal = document.getElementById('pw-modal');
  const pwInput = document.getElementById('pw-input');
  const pwOk = document.getElementById('pw-ok');
  const pwCancel = document.getElementById('pw-cancel');
  const pwError = document.getElementById('pw-error');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      // 編集中なら終了、未編集ならPW入力
      if (isEditing) {
        exitEditMode();
        return;
      }
      pwError.hidden = true;
      pwInput.value = '';
      pwBackdrop.hidden = false;
      pwModal.hidden = false;
      setTimeout(() => pwInput.focus(), 0);
    });
  }

  // モーダル操作
  pwCancel.addEventListener('click', closePwModal);
  pwBackdrop.addEventListener('click', closePwModal);
  pwOk.addEventListener('click', () => {
    if (pwInput.value === ADMIN_PASSWORD) {
      closePwModal();
      enterEditMode();
    } else {
      pwError.hidden = false;
    }
  });
  pwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pwOk.click();
    if (e.key === 'Escape') closePwModal();
  });

  function closePwModal(){
    pwBackdrop.hidden = true;
    pwModal.hidden = true;
  }
});

// 編集モード ON/OFF
function enterEditMode(){
  isEditing = true;
  document.body.classList.add('is-editing');
  // 現在のデータをワークにコピー
  const src = filteredCharacters[currentIndex];
  tempEdited = JSON.parse(JSON.stringify(src));
  // 詳細ビューにいるときだけフォーム化
  if (!document.getElementById('detail-view').classList.contains('hidden')) {
    renderEditableFields();
  }
  // 鉛筆を「編集終了」に見せたい場合はラベルを変える（任意）
  const btn = document.getElementById('edit-btn');
  if (btn) btn.textContent = '編集終了';
    // 追加：右下のアクション表示
  document.getElementById('edit-actions').hidden = false;
  refreshSaveState();
}

function exitEditMode(){
  isEditing = false;
  document.body.classList.remove('is-editing');
  tempEdited = null;
  // 再描画で元の表示に戻す
  if (!document.getElementById('detail-view').classList.contains('hidden')) {
    loadCharacter(currentIndex);
  }
  const btn = document.getElementById('edit-btn');
  if (btn) btn.textContent = '✎';
  document.getElementById('edit-actions').hidden = true;
}

// 詳細ビューの表示を“入力フォーム”に差し替える（保存はしない）
function renderEditableFields(){
  const data = tempEdited || filteredCharacters[currentIndex] || {};

  // === シリーズ（タグ式） ===
  const allSeries = Array.from(new Set(characters.map(c => c.series))).filter(Boolean);
  // 文字列→配列に正規化
  if (!Array.isArray(data.series)) data.series = data.series ? [data.series] : [];

  const summary = document.getElementById('character-summary');
  if (summary) {
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
  }

  // タグ描画
  function renderSeriesTags(){
    const wrap = document.getElementById('series-tags');
    wrap.innerHTML = '';
    (data.series||[]).forEach(s=>{
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${s}<span class="remove" title="削除">✕</span>`;
      el.querySelector('.remove').onclick = ()=>{ 
        data.series = data.series.filter(x=>x!==s);
        renderSeriesTags(); 
        refreshSaveState();
      };
      wrap.appendChild(el);
    });
  }
  renderSeriesTags();

  // 追加入力
  const seriesInput = document.getElementById('series-input');
  seriesInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') {
      const v = seriesInput.value.trim();
      if (v && !data.series.includes(v)) {
        data.series.push(v);
        renderSeriesTags();
        seriesInput.value = '';
        refreshSaveState();
      }
      e.preventDefault();
    }
  });

  // === プロフィール ===
  const profile = document.getElementById('profile');
  if (profile) {
    profile.innerHTML = `
      <h3>プロフィール</h3>
      <label>住んでいるところ：
        <input id="edit-home" class="edit-field" value="${escapeHtml(data.profile?.['住んでいるところ']||'')}" />
      </label><br><br>
      <label>好きなもの・こと：
        <input id="edit-like" class="edit-field" value="${escapeHtml(data.profile?.['好きなもの・こと']||'')}" />
      </label><br><br>
      <label>イメージカラー：
        <select id="edit-color" class="edit-field">
          ${colorOptions((data.profile?.['イメージカラー']||'').toLowerCase())}
        </select>
      </label>
      <div id="color-error" class="field-error" style="display:none;">未対応の色名です。</div>
    `;
  }

  // === 見た目 ===
  const appearance = document.getElementById('appearance');
  if (appearance) {
    appearance.innerHTML = `
      <h3>見た目</h3>
      <textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>
      <div id="appearance-error" class="field-error" style="display:none;">1000文字以内で入力してください。</div>
    `;
  }

  // === メモ ===
  const memo = document.getElementById('memo');
  if (memo) {
    memo.innerHTML = `
      <textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>
      <div id="memo-error" class="field-error" style="display:none;">1000文字以内で入力してください。</div>
    `;
  }

  // 入力イベント → tempEditedに反映
  const $ = (id)=>document.getElementById(id);
  $('edit-home')?.addEventListener('input', (e)=>{ data.profile['住んでいるところ']=e.target.value; refreshSaveState(); });
  $('edit-like')?.addEventListener('input', (e)=>{ data.profile['好きなもの・こと']=e.target.value; refreshSaveState(); });
  $('edit-color')?.addEventListener('change', (e)=>{ data.profile['イメージカラー']=e.target.value; refreshSaveState(); });
  $('edit-appearance')?.addEventListener('input', (e)=>{ data.appearance=e.target.value; refreshSaveState(); });
  $('edit-memo')?.addEventListener('input', (e)=>{ data.memo=e.target.value; refreshSaveState(); });
}

// ユーティリティ
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}
function colorOptions(selected){
  const colors = ["black","white","gray","silver","red","crimson","tomato","coral","orange","gold",
                  "yellow","khaki","olive","green","seagreen","lime","teal","cyan","skyblue","deepskyblue",
                  "blue","navy","indigo","purple","violet","magenta","pink","brown","chocolate","sienna"];
  return colors.map(c=>`<option value="${c}" ${c===selected?'selected':''}>${c}</option>`).join('');
}
// ===== 編集モード（UIのみ） =====
document.addEventListener('DOMContentLoaded', () => {
  const EDIT_PASSWORD = 'kmk2525';
  const editBtn   = document.getElementById('edit-btn');
  const modal     = document.getElementById('pw-modal');
  const pwInput   = document.getElementById('pw-input');
  const okBtn     = document.getElementById('pw-submit');
  const cancelBtn = document.getElementById('pw-cancel');

  if (!editBtn) return; // ボタン未設置なら何もしない

  const openModal = () => {
    modal.hidden = false;
    pwInput.value = '';
    setTimeout(() => pwInput.focus(), 0);
  };
  const closeModal = () => { modal.hidden = true; };

  // 鉛筆クリック -> モーダル
  editBtn.addEventListener('click', openModal);

  // OK：パスワード判定→editingトグル
  okBtn.addEventListener('click', () => {
    if (pwInput.value === EDIT_PASSWORD) {
      document.body.classList.toggle('editing'); // UIフラグをON/OFF
      closeModal();
    } else {
      pwInput.focus();
      pwInput.select();
      alert('パスワードが違います');
    }
  });

  // キャンセル / オーバーレイクリック / ESCで閉じる
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') closeModal();
  });
function validateEdited(data){
  const errors = {};

  // シリーズ：最低1つ
  if (!Array.isArray(data.series) || data.series.length === 0) {
    errors.series = 'シリーズを1つ以上選んでください。';
  }

  // 色：候補内のみ
  const allowed = colorOptions('').match(/value="([^"]+)"/g)?.map(m=>m.replace(/^value="|"$|/g,'')) || [];
  const color = (data.profile?.['イメージカラー']||'').toLowerCase();
  if (color && !allowed.includes(color)) {
    errors.color = '未対応の色名です。';
  }

  // 長さ
  if ((data.appearance||'').length > 1000) errors.appearance = '1000文字以内で入力してください。';
  if ((data.memo||'').length > 1000) errors.memo = '1000文字以内で入力してください。';

  // UIへ反映
  // シリーズ
  const seriesErrEl = document.getElementById('series-error');
  if (seriesErrEl) seriesErrEl.style.display = errors.series ? '' : 'none';

  // 色
  const colorSel = document.getElementById('edit-color');
  const colorErr = document.getElementById('color-error');
  if (colorSel) colorSel.classList.toggle('invalid', !!errors.color);
  if (colorErr) colorErr.style.display = errors.color ? '' : 'none';

  // appearance
  const appTa = document.getElementById('edit-appearance');
  const appErr= document.getElementById('appearance-error');
  if (appTa) appTa.classList.toggle('invalid', !!errors.appearance);
  if (appErr) appErr.style.display = errors.appearance ? '' : 'none';

  // memo
  const memoTa = document.getElementById('edit-memo');
  const memoErr= document.getElementById('memo-error');
  if (memoTa) memoTa.classList.toggle('invalid', !!errors.memo);
  if (memoErr) memoErr.style.display = errors.memo ? '' : 'none';

  return { ok: Object.keys(errors).length === 0, errors };
}

function refreshSaveState(){
  const saveBtn = document.getElementById('edit-save');
  if (!saveBtn || !tempEdited) return;
  const { ok } = validateEdited(tempEdited);
  saveBtn.disabled = !ok;
}

function imgSrcFor(id) {
  return `images/${id}.png`;
}
function setFallbackOnError(imgEl) {
  imgEl.onerror = () => {
    imgEl.onerror = null;              // ループ防止
    imgEl.src = 'images/placeholder.png';
  };
}

});

;