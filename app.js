// =======================
// 隨機專輯 Random Album App
// - 內建 3 張專輯（你的）
// - 不重複抽（抽完一輪重置）
// - 抽到時用 Spotify oEmbed 抓標題/封面
// - 可新增專輯到清單（持久化）
// - 最愛清單（持久化）
// =======================

// ===== localStorage keys =====
const LS_ALBUMS = "ra_custom_albums_v2";     // 你新增的專輯
const LS_FAVS = "ra_favs_v2";               // 最愛清單（存 url）
const LS_META = "ra_meta_cache_v1";         // oEmbed 快取（存 {url:{title,thumb}}）

// ===== 你原本的 3 張專輯（保留）=====
const defaultAlbums = [
  {
    url: "https://open.spotify.com/album/3xtm8BvCvH8xjfbys8DKaA?si=0XswLOKPQMW0N7p9rOqtTw",
    note: "楊世暄 - 普通活著",
  },
  {
    url: "https://open.spotify.com/album/250JODFObFGpfsuIvnE2sy?si=ZSyA47kkQbqLc9XXPjkLhg",
    note: "蛙池 - 蛙池2020-2021",
  },
  {
    url: "https://open.spotify.com/album/6ValxpcsrkQP2ugCU2Kxwy?si=wfMMj_u2S--NnF01yzpnxA",
    note: "萬能青年旅店 - 冀西南林路行",
  },
];

// ===== DOM =====
const btnRandom = document.getElementById("btnRandom");
const btnFav = document.getElementById("btnFav");
const result = document.getElementById("result");
const favList = document.getElementById("favList");
const cover = document.getElementById("cover");
const openSpotify = document.getElementById("openSpotify");

// 新增專輯 UI（你已插到 index.html）
const newName = document.getElementById("newName");
const newUrl = document.getElementById("newUrl");
const newCover = document.getElementById("newCover");
const btnAddAlbum = document.getElementById("btnAddAlbum");

// ===== state =====
let current = null;        // current url
let remaining = [];        // 不重複抽的池

// ===== helpers =====
function safeParse(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeSpotifyUrl(urlRaw) {
  const url = (urlRaw || "").trim();
  if (!url) return "";
  // embed 轉正常
  if (url.includes("open.spotify.com/embed/")) {
    return url.replace("open.spotify.com/embed/", "open.spotify.com/");
  }
  return url;
}

function isValidSpotifyUrl(url) {
  return typeof url === "string" && url.includes("open.spotify.com");
}

// ===== albums store =====
function loadCustomAlbums() {
  // [{name,url,cover}]
  return safeParse(localStorage.getItem(LS_ALBUMS), []);
}
function saveCustomAlbums(list) {
  localStorage.setItem(LS_ALBUMS, JSON.stringify(list));
}
function getAllAlbumUrls() {
  const custom = loadCustomAlbums();
  const urls = [
    ...defaultAlbums.map((a) => normalizeSpotifyUrl(a.url)),
    ...custom.map((a) => normalizeSpotifyUrl(a.url)),
  ].filter(Boolean);

  // 去重
  return Array.from(new Set(urls));
}

// ===== fav store =====
function loadFavs() {
  return safeParse(localStorage.getItem(LS_FAVS), []);
}
function saveFavs(list) {
  localStorage.setItem(LS_FAVS, JSON.stringify(list));
}

// ===== meta cache =====
function loadMetaCache() {
  return safeParse(localStorage.getItem(LS_META), {});
}
function saveMetaCache(obj) {
  localStorage.setItem(LS_META, JSON.stringify(obj));
}

// ===== Spotify oEmbed =====
async function fetchSpotifyMeta(url) {
  const api = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error("Spotify oEmbed failed");
  return res.json(); // { title, thumbnail_url, ... }
}

async function getMeta(url) {
  const u = normalizeSpotifyUrl(url);
  const cache = loadMetaCache();
  if (cache[u]?.title) return cache[u];

  try {
    const meta = await fetchSpotifyMeta(u);
    const v = { title: meta.title || u, thumb: meta.thumbnail_url || "" };
    cache[u] = v;
    saveMetaCache(cache);
    return v;
  } catch {
    const v = { title: u, thumb: "" };
    cache[u] = v;
    saveMetaCache(cache);
    return v;
  }
}

// ===== UI render =====
function setCover(src) {
  const s = (src || "").trim();
  if (!s) {
    cover.style.display = "none";
    cover.removeAttribute("src");
    return;
  }
  cover.style.display = "block";
  cover.src = s;
}

async function showAlbum(url) {
  const u = normalizeSpotifyUrl(url);
  current = u;

  openSpotify.href = u;
  openSpotify.style.pointerEvents = "auto";
  openSpotify.style.opacity = "1";

  result.textContent = "🎧 讀取 Spotify 資訊中…";
  setCover("");

  const meta = await getMeta(u);
  result.textContent = `🎶 ${meta.title}`;
  setCover(meta.thumb || "");
}

// ===== 非重複抽 =====
function resetRemaining() {
  remaining = getAllAlbumUrls();
}

btnRandom.onclick = async () => {
  if (remaining.length === 0) {
    resetRemaining();
    result.textContent = "🔄 已抽完一輪，重新開始";
    setCover("");
    return;
  }

  const i = Math.floor(Math.random() * remaining.length);
  const pick = remaining.splice(i, 1)[0];
  await showAlbum(pick);
};

// ===== 最愛 =====
btnFav.onclick = () => {
  if (!current) {
    result.textContent = "⚠️ 先抽一張專輯";
    return;
  }

  const favs = loadFavs().map(normalizeSpotifyUrl);
  if (favs.includes(current)) {
    result.textContent = "⭐ 已在最愛中";
    return;
  }

  favs.unshift(current);
  saveFavs(favs);
  renderFavs();
  result.textContent = "⭐ 已加入最愛";
};

async function renderFavs() {
  const favs = loadFavs().map(normalizeSpotifyUrl);
  favList.innerHTML = "";

  if (favs.length === 0) {
    favList.innerHTML = "<li>（還沒有最愛）</li>";
    return;
  }

  // 依序補 meta（用快取會很快）
  for (let idx = 0; idx < favs.length; idx++) {
    const url = favs[idx];
    const li = document.createElement("li");

    const meta = await getMeta(url);

    const a = document.createElement("a");
    a.href = url;
    a.textContent = meta.title || url;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.color = "#c9d6ff";

    const del = document.createElement("button");
    del.textContent = "刪除";
    del.onclick = () => {
      const next = loadFavs().map(normalizeSpotifyUrl);
      next.splice(idx, 1);
      saveFavs(next);
      renderFavs();
    };

    li.append(a, del);
    favList.appendChild(li);
  }
}

// ===== 新增專輯 =====
function addAlbumFromForm() {
  const name = (newName?.value || "").trim();
  const url = normalizeSpotifyUrl(newUrl?.value || "");
  const coverUrl = (newCover?.value || "").trim();

  if (!name) return alert("請先填「顯示名稱」");
  if (!url) return alert("請先貼 Spotify 專輯連結");
  if (!isValidSpotifyUrl(url)) return alert("這看起來不像 Spotify 連結（至少要包含 open.spotify.com）");

  const custom = loadCustomAlbums();

  // 同 url 就更新
  const idx = custom.findIndex((a) => normalizeSpotifyUrl(a.url) === url);
  if (idx >= 0) {
    custom[idx] = { ...custom[idx], name, url, cover: coverUrl };
  } else {
    custom.push({ name, url, cover: coverUrl, createdAt: Date.now() });
  }
  saveCustomAlbums(custom);

  // 也把你填的 name / cover 直接寫進 meta 快取（讓顯示更快）
  const cache = loadMetaCache();
  cache[url] = {
    title: name,
    thumb: coverUrl || cache[url]?.thumb || "",
  };
  saveMetaCache(cache);

  // 更新抽籤池：如果目前已抽到一半，直接把新歌塞回 remaining（避免要等下一輪）
  if (!remaining.includes(url)) remaining.push(url);

  // 清空欄位
  if (newName) newName.value = "";
  if (newUrl) newUrl.value = "";
  if (newCover) newCover.value = "";

  alert("已加入清單 ✅");
}

btnAddAlbum?.addEventListener("click", addAlbumFromForm);
[newName, newUrl, newCover].forEach((el) => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAlbumFromForm();
  });
});

// ===== init =====
resetRemaining();
renderFavs();