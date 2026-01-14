// ===== 新增專輯（爽版：貼 URL 自動抓名稱/封面）=====
async function autoFillFromUrl() {
  const url = normalizeSpotifyUrl(newUrl?.value || "");
  if (!url) return alert("請先貼 Spotify 專輯連結（必填）");
  if (!isValidSpotifyUrl(url)) return alert("這看起來不像 Spotify 連結（至少要包含 open.spotify.com）");

  // 抓 oEmbed（或快取）
  const meta = await getMeta(url);

  // 只有空的時候才填，避免覆蓋你手動修改
  if (newName && !newName.value.trim()) newName.value = meta.title || "";
  if (newCover && !newCover.value.trim()) newCover.value = meta.thumb || "";

  result.textContent = "✨ 已自動填入名稱/封面";
}

async function addAlbumFromForm() {
  const url = normalizeSpotifyUrl(newUrl?.value || "");
  if (!url) return alert("請先貼 Spotify 專輯連結（必填）");
  if (!isValidSpotifyUrl(url)) return alert("這看起來不像 Spotify 連結（至少要包含 open.spotify.com）");

  // 名稱/封面可以不填：沒填就自動抓
  let name = (newName?.value || "").trim();
  let coverUrl = (newCover?.value || "").trim();

  if (!name || !coverUrl) {
    const meta = await getMeta(url);
    if (!name) name = meta.title || url;
    if (!coverUrl) coverUrl = meta.thumb || "";
  }

  const custom = loadCustomAlbums();

  // 同 url 就更新
  const idx = custom.findIndex((a) => normalizeSpotifyUrl(a.url) === url);
  if (idx >= 0) {
    custom[idx] = { ...custom[idx], name, url, cover: coverUrl };
  } else {
    custom.push({ name, url, cover: coverUrl, createdAt: Date.now() });
  }
  saveCustomAlbums(custom);

  // 寫進 meta 快取（讓抽到/最愛顯示更快）
  const cache = loadMetaCache();
  cache[url] = { title: name, thumb: coverUrl };
  saveMetaCache(cache);

  // 新增到抽籤池（立刻生效）
  if (!remaining.includes(url)) remaining.push(url);

  // 清空欄位
  if (newName) newName.value = "";
  if (newUrl) newUrl.value = "";
  if (newCover) newCover.value = "";

  alert("已加入清單 ✅");
}

btnAddAlbum?.addEventListener("click", () => addAlbumFromForm());
btnAutoFill?.addEventListener("click", () => autoFillFromUrl());

// Enter 也可以直接加入（你現在 UI 的順序：Url / Name / Cover）
[newUrl, newName, newCover].forEach((el) => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAlbumFromForm();
  });
});