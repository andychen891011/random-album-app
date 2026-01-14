// 🔗 Spotify 專輯清單（放你複製的專輯連結）
const albums = [
  "https://open.spotify.com/album/3xtm8BvCvH8xjfbys8DKaA?si=0XswLOKPQMW0N7p9rOqtTw", // 楊世暄 - 普通活著
  "https://open.spotify.com/album/250JODFObFGpfsuIvnE2sy?si=ZSyA47kkQbqLc9XXPjkLhg", // 蛙池 - 蛙池2020-2021
  "https://open.spotify.com/album/6ValxpcsrkQP2ugCU2Kxwy?si=wfMMj_u2S--NnF01yzpnxA"  // 萬能青年旅店 - 冀西南林路行
];

// --- 不重複抽 ---
let remaining = [...albums];
let current = null;

// --- DOM ---
const btnRandom = document.getElementById("btnRandom");
const btnFav = document.getElementById("btnFav");
const result = document.getElementById("result");
const favList = document.getElementById("favList");
const cover = document.getElementById("cover");
const openSpotify = document.getElementById("openSpotify");

// --- localStorage ---
const KEY = "spotify-random-favs";

function loadFavs() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}
function saveFavs(v) {
  localStorage.setItem(KEY, JSON.stringify(v));
}

// --- Spotify oEmbed ---
async function fetchSpotifyMeta(url) {
  const api = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error("Spotify fetch failed");
  return res.json();
}

// --- 顯示抽到的專輯 ---
async function showAlbum(url) {
  current = url;
  openSpotify.href = url;
  result.textContent = "🎧 讀取 Spotify 資訊中…";
  cover.style.display = "none";

  try {
    const meta = await fetchSpotifyMeta(url);
    result.textContent = `🎶 ${meta.title}`;
    cover.src = meta.thumbnail_url;
    cover.style.display = "block";
  } catch {
    result.textContent = "🎶 已抽到（可直接在 Spotify 開啟）";
  }
}

// --- 抽一張 ---
btnRandom.onclick = async () => {
  if (remaining.length === 0) {
    remaining = [...albums];
    result.textContent = "🔄 已抽完一輪，重新開始";
    cover.style.display = "none";
    return;
  }

  const i = Math.floor(Math.random() * remaining.length);
  const pick = remaining.splice(i, 1)[0];
  await showAlbum(pick);
};

// --- 加到最愛 ---
btnFav.onclick = () => {
  if (!current) {
    result.textContent = "⚠️ 先抽一張專輯";
    return;
  }

  const favs = loadFavs();
  if (favs.includes(current)) {
    result.textContent = "⭐ 已在最愛中";
    return;
  }

  favs.unshift(current);
  saveFavs(favs);
  renderFavs();
  result.textContent = "⭐ 已加入最愛";
};

// --- 渲染最愛 ---
function renderFavs() {
  const favs = loadFavs();
  favList.innerHTML = "";

  if (favs.length === 0) {
    favList.innerHTML = "<li>（還沒有最愛）</li>";
    return;
  }

  favs.forEach((url, idx) => {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = url;
    a.textContent = url;
    a.target = "_blank";
    a.style.color = "#c9d6ff";

    const del = document.createElement("button");
    del.textContent = "刪除";
    del.onclick = () => {
      const next = loadFavs();
      next.splice(idx, 1);
      saveFavs(next);
      renderFavs();
    };

    li.append(a, del);
    favList.appendChild(li);
  });
}

renderFavs();