// =======================
// Random Album App — 全裝爽版
// 功能：
// - 抽籤池 Pool（可控範圍）
// - 不重複抽（本輪）
// - oEmbed 自動抓：標題 / 封面
// - 單筆新增（貼網址就好）
// - 批次匯入（多行貼上）
// - 最愛 / 最近抽到
// - 搜尋 / 只看池
// - 備份匯出 / 匯入還原
// =======================

const LS = {
  LIB: "ra_lib_v3",        // [{url,name,cover,createdAt}]
  POOL: "ra_pool_v3",      // [url,...]
  FAV: "ra_fav_v3",        // [url,...]
  HIST: "ra_hist_v3",      // [{url,ts},...]
  META: "ra_meta_cache_v2" // {url:{title,thumb}}
};

const defaultAlbums = [
  {
    url: "https://open.spotify.com/album/3xtm8BvCvH8xjfbys8DKaA?si=0XswLOKPQMW0N7p9rOqtTw",
    name: "楊世暄 — 普通活著",
    cover: ""
  },
  {
    url: "https://open.spotify.com/album/250JODFObFGpfsuIvnE2sy?si=ZSyA47kkQbqLc9XXPjkLhg",
    name: "蛙池 — 蛙池2020-2021",
    cover: ""
  },
  {
    url: "https://open.spotify.com/album/6ValxpcsrkQP2ugCU2Kxwy?si=wfMMj_u2S--NnF01yzpnxA",
    name: "萬能青年旅店 — 冀西南林路行",
    cover: ""
  }
];

// ===== DOM =====
const $ = (id) => document.getElementById(id);

const btnRandom = $("btnRandom");
const btnFav = $("btnFav");
const result = $("result");
const cover = $("cover");
const openSpotify = $("openSpotify");

const newUrl = $("newUrl");
const newName = $("newName");
const newCover = $("newCover");
const btnAddAlbum = $("btnAddAlbum");
const btnAutoFill = $("btnAutoFill");
const chkAddToPool = $("chkAddToPool");

const batchInput = $("batchInput");
const btnBatchImport = $("btnBatchImport");
const chkBatchToPool = $("chkBatchToPool");

const libraryList = $("libraryList");
const favList = $("favList");
const historyList = $("historyList");

const search = $("search");
const btnPoolOnly = $("btnPoolOnly");
const btnShowAll = $("btnShowAll");
const btnPoolSelectAll = $("btnPoolSelectAll");
const btnPoolSelectNone = $("btnPoolSelectNone");

const btnResetRound = $("btnResetRound");
const btnClearHistory = $("btnClearHistory");

const btnClearCustom = $("btnClearCustom");
const btnClearFavs = $("btnClearFavs");

const backupArea = $("backupArea");
const btnExport = $("btnExport");
const btnImport = $("btnImport");

// ===== state =====
let currentUrl = null;
let remaining = [];          // 本輪不重複池（依照目前 pool 生成）
let viewPoolOnly = false;    // UI 篩選

// ===== utils =====
function safeParse(s, fallback) {
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
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
  return typeof url === "string" && url.includes("open.spotify.com/album/");
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function nowTs() { return Date.now(); }

// ===== storage =====
function loadLib() { return safeParse(localStorage.getItem(LS.LIB), []); }
function saveLib(v) { localStorage.setItem(LS.LIB, JSON.stringify(v)); }

function loadPool() { return safeParse(localStorage.getItem(LS.POOL), []); }
function savePool(v) { localStorage.setItem(LS.POOL, JSON.stringify(v)); }

function loadFav() { return safeParse(localStorage.getItem(LS.FAV), []); }
function saveFav(v) { localStorage.setItem(LS.FAV, JSON.stringify(v)); }

function loadHist() { return safeParse(localStorage.getItem(LS.HIST), []); }
function saveHist(v) { localStorage.setItem(LS.HIST, JSON.stringify(v)); }

function loadMeta() { return safeParse(localStorage.getItem(LS.META), {}); }
function saveMeta(v) { localStorage.setItem(LS.META, JSON.stringify(v)); }

// ===== meta (oEmbed) =====
async function fetchSpotifyMeta(url) {
  const api = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error("Spotify oEmbed failed");
  return res.json(); // { title, thumbnail_url, ... }
}

async function getMeta(url) {
  const u = normalizeSpotifyUrl(url);
  const cache = loadMeta();
  if (cache[u]?.title) return cache[u];

  try {
    const meta = await fetchSpotifyMeta(u);
    const v = { title: meta.title || u, thumb: meta.thumbnail_url || "" };
    cache[u] = v;
    saveMeta(cache);
    return v;
  } catch {
    const v = { title: u, thumb: "" };
    cache[u] = v;
    saveMeta(cache);
    return v;
  }
}

// ===== library helpers =====
function ensureDefaultSeed() {
  // 第一次開，幫你把 defaultAlbums 放進收藏庫（若收藏庫空）
  const lib = loadLib();
  if (lib.length > 0) return;

  const seeded = defaultAlbums.map(a => ({
    url: normalizeSpotifyUrl(a.url),
    name: a.name || "",
    cover: a.cover || "",
    createdAt: nowTs()
  }));
  saveLib(seeded);

  // 順便預設全加入 pool
  savePool(seeded.map(x => x.url));
}

function getLibMap() {
  const lib = loadLib();
  const map = new Map();
  for (const item of lib) {
    const u = normalizeSpotifyUrl(item.url);
    if (!u) continue;
    map.set(u, { ...item, url: u });
  }
  return map;
}

function upsertLibItem(item) {
  const u = normalizeSpotifyUrl(item.url);
  if (!u) return;

  const lib = loadLib();
  const idx = lib.findIndex(x => normalizeSpotifyUrl(x.url) === u);

  const next = {
    url: u,
    name: (item.name || "").trim(),
    cover: (item.cover || "").trim(),
    createdAt: item.createdAt || nowTs()
  };

  if (idx >= 0) lib[idx] = { ...lib[idx], ...next };
  else lib.unshift(next);

  saveLib(lib);
}

function removeLibByUrl(url) {
  const u = normalizeSpotifyUrl(url);
  saveLib(loadLib().filter(x => normalizeSpotifyUrl(x.url) !== u));
  // 同時從 pool / fav 移除
  savePool(loadPool().filter(x => normalizeSpotifyUrl(x) !== u));
  saveFav(loadFav().filter(x => normalizeSpotifyUrl(x) !== u));
  // history 不強制移除（保留紀錄）
}

// ===== pool helpers =====
function isInPool(url) {
  const u = normalizeSpotifyUrl(url);
  return loadPool().map(normalizeSpotifyUrl).includes(u);
}

function setPool(url, on) {
  const u = normalizeSpotifyUrl(url);
  let pool = loadPool().map(normalizeSpotifyUrl);
  if (on) {
    if (!pool.includes(u)) pool.unshift(u);
  } else {
    pool = pool.filter(x => x !== u);
  }
  savePool(uniq(pool));
  resetRemaining(); // pool 改了，本輪池也跟著更新
}

// ===== render current =====
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
  currentUrl = u;

  openSpotify.href = u;
  openSpotify.style.pointerEvents = "auto";
  openSpotify.style.opacity = "1";

  result.textContent = "🎧 讀取 Spotify 資訊中…";
  setCover("");

  const meta = await getMeta(u);

  // 如果收藏庫裡沒有名字或封面，順便補上（爽）
  const map = getLibMap();
  const libItem = map.get(u);
  const name = (libItem?.name || "").trim() || meta.title || u;
  const thumb = (libItem?.cover || "").trim() || meta.thumb || "";

  if (!libItem || (!libItem.name && meta.title) || (!libItem.cover && meta.thumb)) {
    upsertLibItem({ url: u, name, cover: thumb, createdAt: libItem?.createdAt });
  }

  result.textContent = `🎶 ${name}`;
  setCover(thumb);

  // 記錄最近抽到
  const hist = loadHist();
  hist.unshift({ url: u, ts: nowTs() });
  saveHist(hist.slice(0, 20));
  renderHistory();
  renderLibrary(); // 因為可能剛補資料
}

// ===== random draw (pool first) =====
function getActiveDrawUrls() {
  const libUrls = loadLib().map(x => normalizeSpotifyUrl(x.url)).filter(Boolean);
  const pool = loadPool().map(normalizeSpotifyUrl).filter(Boolean);

  // 若 pool 有東西就只抽 pool；pool 空就抽整個收藏庫
  const base = pool.length ? pool : libUrls;
  return uniq(base).filter(u => libUrls.includes(u)); // pool 中已被刪的要排除
}

function resetRemaining() {
  remaining = getActiveDrawUrls();
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

btnResetRound.onclick = () => {
  resetRemaining();
  result.textContent = "🔄 已重置本輪不重複";
};

// ===== fav =====
function renderFavs() {
  const favs = loadFav().map(normalizeSpotifyUrl);
  favList.innerHTML = "";

  if (!favs.length) {
    favList.innerHTML = "<li class='muted'>（還沒有最愛）</li>";
    return;
  }

  const map = getLibMap();

  favs.forEach((url) => {
    const li = document.createElement("li");
    li.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = map.get(url)?.name || url;

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "在 Spotify 打開";

    left.appendChild(title);
    left.appendChild(a);

    const right = document.createElement("div");
    right.className = "right";

    const del = document.createElement("button");
    del.className = "secondary";
    del.textContent = "移除";
    del.onclick = () => {
      saveFav(loadFav().map(normalizeSpotifyUrl).filter(x => x !== url));
      renderFavs();
    };

    right.appendChild(del);

    li.appendChild(left);
    li.appendChild(right);
    favList.appendChild(li);
  });
}

btnFav.onclick = () => {
  if (!currentUrl) return (result.textContent = "⚠️ 先抽一張專輯");
  const favs = loadFav().map(normalizeSpotifyUrl);
  if (favs.includes(currentUrl)) return (result.textContent = "⭐ 已在最愛中");
  favs.unshift(currentUrl);
  saveFav(uniq(favs));
  renderFavs();
  result.textContent = "⭐ 已加入最愛";
};

btnClearFavs.onclick = () => {
  if (!confirm("確定要清空最愛？")) return;
  saveFav([]);
  renderFavs();
};

// ===== history =====
function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function renderHistory() {
  const hist = loadHist();
  historyList.innerHTML = "";

  if (!hist.length) {
    historyList.innerHTML = "<li class='muted'>（還沒有最近抽到）</li>";
    return;
  }

  const map = getLibMap();

  hist.forEach((h) => {
    const url = normalizeSpotifyUrl(h.url);
    const li = document.createElement("li");
    li.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = map.get(url)?.name || url;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `🕒 ${fmtTime(h.ts)}`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "right";

    const open = document.createElement("a");
    open.className = "link";
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "開 Spotify";

    right.appendChild(open);

    li.appendChild(left);
    li.appendChild(right);
    historyList.appendChild(li);
  });
}

btnClearHistory.onclick = () => {
  if (!confirm("確定清空最近抽到？")) return;
  saveHist([]);
  renderHistory();
};

// ===== add single =====
async function autoFillFromUrl() {
  const url = normalizeSpotifyUrl(newUrl.value || "");
  if (!url) return alert("請先貼 Spotify 專輯連結（必填）");
  if (!isValidSpotifyUrl(url)) return alert("請貼『Spotify 專輯』連結（open.spotify.com/album/…）");

  const meta = await getMeta(url);
  if (!newName.value.trim()) newName.value = meta.title || "";
  if (!newCover.value.trim()) newCover.value = meta.thumb || "";
  result.textContent = "✨ 已自動填入名稱/封面";
}

async function addAlbumFromForm() {
  const url = normalizeSpotifyUrl(newUrl.value || "");
  if (!url) return alert("請先貼 Spotify 專輯連結（必填）");
  if (!isValidSpotifyUrl(url)) return alert("請貼『Spotify 專輯』連結（open.spotify.com/album/…）");

  let name = (newName.value || "").trim();
  let cov = (newCover.value || "").trim();

  // 沒填就抓
  if (!name || !cov) {
    const meta = await getMeta(url);
    if (!name) name = meta.title || url;
    if (!cov) cov = meta.thumb || "";
  }

  upsertLibItem({ url, name, cover: cov });

  // meta cache 也補一下
  const cache = loadMeta();
  cache[url] = { title: name, thumb: cov };
  saveMeta(cache);

  // 加入池（可選）
  if (chkAddToPool.checked) setPool(url, true);

  // 清空
  newUrl.value = "";
  newName.value = "";
  newCover.value = "";

  renderLibrary();
  alert("已加入收藏庫 ✅");
}

btnAutoFill.onclick = () => autoFillFromUrl();
btnAddAlbum.onclick = () => addAlbumFromForm();

// Enter：在 URL 直接 Enter 就加入
[newUrl, newName, newCover].forEach(el => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAlbumFromForm();
  });
});

// ===== batch import =====
function extractUrlsFromText(text) {
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeSpotifyUrl)
    .filter(isValidSpotifyUrl);
}

async function batchImport() {
  const urls = uniq(extractUrlsFromText(batchInput.value || ""));
  if (!urls.length) return alert("請先貼一堆 Spotify 專輯連結（每行一個）");

  result.textContent = `📥 匯入中…（${urls.length}）`;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const meta = await getMeta(url);

    // 若已存在就不覆蓋手動名字（但封面缺就補）
    const map = getLibMap();
    const exist = map.get(url);

    const name = (exist?.name || "").trim() || meta.title || url;
    const cov = (exist?.cover || "").trim() || meta.thumb || "";

    upsertLibItem({ url, name, cover: cov, createdAt: exist?.createdAt });

    if (chkBatchToPool.checked) setPool(url, true);
  }

  batchInput.value = "";
  renderLibrary();
  result.textContent = "📥 匯入完成 ✅";
  alert("批次匯入完成 ✅");
}

btnBatchImport.onclick = () => batchImport();

// ===== library render + pool toggles =====
function renderLibrary() {
  const lib = loadLib();
  const poolSet = new Set(loadPool().map(normalizeSpotifyUrl));
  const q = (search.value || "").trim().toLowerCase();

  let list = lib;

  if (viewPoolOnly) {
    list = list.filter(x => poolSet.has(normalizeSpotifyUrl(x.url)));
  }

  if (q) {
    list = list.filter(x => {
      const name = (x.name || "").toLowerCase();
      const url = (x.url || "").toLowerCase();
      return name.includes(q) || url.includes(q);
    });
  }

  libraryList.innerHTML = "";

  if (!list.length) {
    libraryList.innerHTML = "<li class='muted'>（沒有符合的項目）</li>";
    return;
  }

  list.forEach((item) => {
    const url = normalizeSpotifyUrl(item.url);
    const li = document.createElement("li");
    li.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.name || url;

    const meta = document.createElement("div");
    meta.className = "meta";

    const open = document.createElement("a");
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Spotify";

    meta.appendChild(open);
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "right";

    // pool toggle
    const toggle = document.createElement("button");
    const inPool = poolSet.has(url);
    toggle.className = "secondary";
    toggle.textContent = inPool ? "✅ 在池" : "➕ 加入池";
    toggle.onclick = () => {
      setPool(url, !isInPool(url));
      renderLibrary();
    };

    // delete from library
    const del = document.createElement("button");
    del.className = "secondary danger";
    del.textContent = "刪";
    del.onclick = () => {
      if (!confirm("確定要從收藏庫刪除這張？（也會從抽籤池與最愛移除）")) return;
      removeLibByUrl(url);
      resetRemaining();
      renderLibrary();
      renderFavs();
    };

    right.appendChild(toggle);
    right.appendChild(del);

    li.appendChild(left);
    li.appendChild(right);
    libraryList.appendChild(li);
  });
}

search.addEventListener("input", () => renderLibrary());

btnPoolOnly.onclick = () => {
  viewPoolOnly = true;
  renderLibrary();
};

btnShowAll.onclick = () => {
  viewPoolOnly = false;
  renderLibrary();
};

btnPoolSelectAll.onclick = () => {
  const urls = loadLib().map(x => normalizeSpotifyUrl(x.url)).filter(Boolean);
  savePool(uniq(urls));
  resetRemaining();
  renderLibrary();
};

btnPoolSelectNone.onclick = () => {
  savePool([]);
  resetRemaining();
  renderLibrary();
};

btnClearCustom.onclick = () => {
  if (!confirm("確定清空『自訂收藏』？（保留內建 3 張）")) return;

  // 把收藏庫重置成 defaultAlbums
  const seeded = defaultAlbums.map(a => ({
    url: normalizeSpotifyUrl(a.url),
    name: a.name || "",
    cover: a.cover || "",
    createdAt: nowTs()
  }));
  saveLib(seeded);
  savePool(seeded.map(x => x.url));
  resetRemaining();
  renderLibrary();
  alert("已清空自訂收藏（回到內建 3 張）");
};

// ===== backup / restore =====
function exportAll() {
  const data = {
    version: 1,
    lib: loadLib(),
    pool: loadPool(),
    fav: loadFav(),
    hist: loadHist()
  };
  const json = JSON.stringify(data, null, 2);
  backupArea.value = json;

  // 嘗試複製
  navigator.clipboard?.writeText(json).then(
    () => (result.textContent = "📤 已匯出並複製到剪貼簿"),
    () => (result.textContent = "📤 已匯出（可手動複製）")
  );
}

function importAll() {
  const raw = backupArea.value || "";
  if (!raw.trim()) return alert("請先貼上匯入 JSON");

  const data = safeParse(raw, null);
  if (!data || !Array.isArray(data.lib)) return alert("JSON 格式不對");

  if (!confirm("匯入會覆蓋目前資料（收藏/池/最愛/最近），確定？")) return;

  saveLib(data.lib || []);
  savePool(data.pool || []);
  saveFav(data.fav || []);
  saveHist(data.hist || []);

  resetRemaining();
  renderLibrary();
  renderFavs();
  renderHistory();
  alert("匯入完成 ✅");
}

btnExport.onclick = () => exportAll();
btnImport.onclick = () => importAll();

// ===== init =====
ensureDefaultSeed();
resetRemaining();
renderLibrary();
renderFavs();
renderHistory();

result.textContent = "✅ 準備好了：抽一張吧！";
openSpotify.style.pointerEvents = "none";
openSpotify.style.opacity = "0.5";