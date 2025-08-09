// ===== キャラデータ（直接埋め込み） =====
const characters = [
  {
    id: "001",
    name: "ニャニャパー",
    series: "ねこニャ町",
    image: "images/001.png",
    profile: {
      "住んでいるところ": "お城",
      "好きなもの・こと": "天体観測",
      "イメージカラー": "purple"
    },
    appearance: "王冠 コウモリの羽",
    memo: "王冠の宝石はガーネット。友達とカフェに行くのがはやり。"
  },
  {
    id: "002",
    name: "ニャニャピー",
    series: "ねこニャ町",
    image: "images/002.png",
    profile: {
      "住んでいるところ": "お城",
      "好きなもの・こと": "お絵描き",
      "イメージカラー": "skyblue"
    },
    appearance: "ハートの王冠 トンボの羽",
    memo: "エカキツコに絵を見てもらっている。王冠の宝石はトパーズ"
  },
  {
    id: "004",
    name: "チャチャスー",
    series: "ねこニャ町",
    image: "images/004.png",
    profile: {
      "住んでいるところ": "一軒家",
      "好きなもの・こと": "料理",
      "イメージカラー": "skyblue"
    },
    appearance: "コック帽・鳥の羽",
    memo: "小さい子の扱いが得意"
  },
  {
    id: "029",
    name: "メイ",
    series: "にじいろ学校",
    image: "images/029.png",
    profile: {
      "住んでいるところ": "学校寮",
      "好きなもの・こと": "-",
      "イメージカラー": "-"
    },
    appearance: "-",
    memo: "-"
  },
  {
    id: "031",
    name: "パレット",
    series: "にじいろ学校",
    image: "images/031.png",
    profile: {
      "住んでいるところ": "学校寮",
      "好きなもの・こと": "-",
      "イメージカラー": "-"
    },
    appearance: "-",
    memo: "-"
  },
  {
    id: "032",
    name: "チョコ",
    series: "にじいろ学校",
    image: "images/032.png",
    profile: {
      "住んでいるところ": "学校寮",
      "好きなもの・こと": "-",
      "イメージカラー": "-"
    },
    appearance: "-",
    memo: "-"
  },
  {
    id: "036",
    name: "シャワ・ワワー",
    series: "ねこニャ町",
    image: "images/036.png",
    profile: {
      "住んでいるところ": "川原",
      "好きなもの・こと": "料理",
      "イメージカラー": "blue"
    },
    appearance: "水のかんむり、ゴウカチョウチョの羽",
    memo: "横にいるのは水の精霊、スイスイ"
  }
];
// ===== グローバル変数 =====
let currentIndex = 0;
let filteredCharacters = [...characters];

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
  renderList(filteredCharacters);  // 初期は一覧ビューを表示

  // 戻るボタン
  document.querySelector('.back-button').addEventListener('click', showList);

  // ナビゲーションボタン
  document.querySelector('.nav-button.next').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });
  document.querySelector('.nav-button.prev').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + filteredCharacters.length) % filteredCharacters.length;
    loadCharacter(currentIndex);
  });
});
