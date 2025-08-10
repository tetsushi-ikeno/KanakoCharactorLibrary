let characters = [];
let filteredCharacters = [];
let currentIndex = 0;
let activeSeries = 'all';
let keyword = '';

async function loadData() {
  try {
    const res = await fetch('data/characters.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTPエラー: ${res.status}`);
    }
    characters = await res.json();
    filteredCharacters = [...characters];
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

document.getElementById('character-image').src = data.image;
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
  const container = document.getElementById('list-container');
  container.innerHTML = '';

  charactersToRender.forEach((chara, index) => {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <img src="${chara.image}" alt="${chara.name}">
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
});

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

// === 追加: 編集UIだけ（保存なし） ===
const ADMIN_PASSWORD = 'kmk2525';
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
  // 詳細ビューにいるときだけフォーム化
  if (!document.getElementById('detail-view').classList.contains('hidden')) {
    renderEditableFields();
  }
  // 鉛筆を「編集終了」に見せたい場合はラベルを変える（任意）
  const btn = document.getElementById('edit-btn');
  if (btn) btn.textContent = '編集終了';
}

function exitEditMode(){
  isEditing = false;
  document.body.classList.remove('is-editing');
  // 再描画で元の表示に戻す
  if (!document.getElementById('detail-view').classList.contains('hidden')) {
    loadCharacter(currentIndex);
  }
  const btn = document.getElementById('edit-btn');
  if (btn) btn.textContent = '✎';
}

// 詳細ビューの表示を“入力フォーム”に差し替える（保存はしない）
function renderEditableFields(){
  const data = (filteredCharacters[currentIndex] || {});
  // サマリー（シリーズのみ編集UI / IDと名前は非編集）
  const summary = document.getElementById('character-summary');
  if (summary) {
    summary.innerHTML = `
      <p>No.${data.id}</p>
      <h2>${data.name}</h2>
      <label>シリーズ：
        <select id="edit-series" class="edit-field">
          ${['ねこニャ町','四角丸町','にじいろ学校'].map(s =>
            `<option value="${s}" ${s===data.series?'selected':''}>${s}</option>`).join('')}
        </select>
      </label>
    `;
  }

  // プロフィール
  const profile = document.getElementById('profile');
  if (profile) {
    profile.innerHTML = `
      <h3>プロフィール</h3>
      <label>住んでいるところ：<input id="edit-home" class="edit-field" value="${escapeHtml(data.profile?.['住んでいるところ']||'')}" /></label><br><br>
      <label>好きなもの・こと：<input id="edit-like" class="edit-field" value="${escapeHtml(data.profile?.['好きなもの・こと']||'')}" /></label><br><br>
      <label>イメージカラー：
        <select id="edit-color" class="edit-field">
          ${colorOptions((data.profile?.['イメージカラー']||'').toLowerCase())}
        </select>
      </label>
    `;
  }

  // 見た目
  const appearance = document.getElementById('appearance');
  if (appearance) {
    appearance.innerHTML = `
      <h3>見た目</h3>
      <textarea id="edit-appearance" class="edit-field textarea">${escapeHtml(data.appearance||'')}</textarea>
    `;
  }

  // メモ
  const memo = document.getElementById('memo');
  if (memo) {
    memo.innerHTML = `
      <textarea id="edit-memo" class="edit-field textarea">${escapeHtml(data.memo||'')}</textarea>
    `;
  }
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

;