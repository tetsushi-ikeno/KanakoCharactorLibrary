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
;