
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDceiRo04NXe1e4-W9iL50KnAu-AywKDR2SWn2_tib0UueRtfzGjndwwjspzF-ha5_UBBOjWAIqLUo/pub?output=csv";

const IMAGE_BASE = "./images/";

let characters = [];
let selected = [];
let isRendering = false;
let renderVersion = 0;

const characterList = document.getElementById("characterList");
const selectedList = document.getElementById("selectedList");
const searchInput = document.getElementById("searchInput");
const columnsInput = document.getElementById("columns");
const scaleInput = document.getElementById("scale");
const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");

const previewButton = document.getElementById("previewButton");
const downloadButton = document.getElementById("downloadButton");

// CSV読み込み
function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());

      if (row.some(cell => cell !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
    } else {
      value += c;
    }
  }

  row.push(value.trim());

  if (row.some(cell => cell !== "")) {
    rows.push(row);
  }

  return rows;
}

async function loadCharacters() {
  characterList.textContent = "読み込み中...";

  try {
    const response = await fetch(CSV_URL);

    if (!response.ok) {
      throw new Error("CSVを取得できませんでした");
    }

    const text = await response.text();
    const rows = parseCSV(text);
    const header = rows.shift();

    const koreanIndex = header.indexOf("韓国語名");
    const japaneseIndex = header.indexOf("日本語名");
    const imageIndex = header.indexOf("画像ファイル名");

    if ([koreanIndex, japaneseIndex, imageIndex].includes(-1)) {
      throw new Error("スプレッドシートの見出しを確認してください");
    }

    characters = rows.map(row => ({
      korean: row[koreanIndex],
      japanese: row[japaneseIndex],
      filename: row[imageIndex]
    })).filter(c => c.korean && c.japanese && c.filename);

    // 韓国語名で 가나다順
    characters.sort((a, b) =>
      a.korean.localeCompare(b.korean, "ko")
    );

    renderCharacters();

  } catch (error) {
    characterList.textContent =
      "読み込みに失敗しました：" + error.message;
  }
}

// 画像ファイルのパス
function imagePath(character) {
  return IMAGE_BASE +
    encodeURIComponent(character.filename).replace(/%2F/gi, "/");
}

// キャラクター一覧
function renderCharacters() {
  const keyword = searchInput.value.trim().toLowerCase();

  characterList.innerHTML = "";

  characters
    .filter(c =>
      c.japanese.toLowerCase().includes(keyword) ||
      c.korean.toLowerCase().includes(keyword)
    )
    .forEach(character => {
      const item = document.createElement("button");
      item.className = "character-item";

      item.classList.toggle(
        "selected",
        selected.includes(character)
      );

      const img = document.createElement("img");
      img.src = imagePath(character);
      img.alt = character.japanese;
      img.loading = "lazy";

      const name = document.createElement("span");
      name.textContent = character.japanese;

      item.append(img, name);

      item.addEventListener("click", () => {
        toggleCharacter(character);
      });

      characterList.appendChild(item);
    });
}

// 選択・解除
function toggleCharacter(character) {
  if (selected.includes(character)) {
    selected = selected.filter(c => c !== character);
  } else {
    selected.push(character);
  }

  renderCharacters();
  renderSelected();
  renderPreview();
}

// 選択済み一覧
function renderSelected() {
  selectedList.innerHTML = "";

  selected.forEach((character, index) => {
    const item = document.createElement("div");
    item.className = "selected-item";

    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${character.japanese}`;

    const up = document.createElement("button");
    up.textContent = "↑";
    up.title = "前へ";
    up.disabled = index === 0;

    up.addEventListener("click", () => {
      moveCharacter(index, -1);
    });

    const down = document.createElement("button");
    down.textContent = "↓";
    down.title = "後ろへ";
    down.disabled = index === selected.length - 1;

    down.addEventListener("click", () => {
      moveCharacter(index, 1);
    });

    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = "選択解除";

    remove.addEventListener("click", () => {
      toggleCharacter(character);
    });

    item.append(name, up, down, remove);
    selectedList.appendChild(item);
  });
}

// 順番変更
function moveCharacter(index, direction) {
  const target = index + direction;

  if (target < 0 || target >= selected.length) {
    return;
  }

  [selected[index], selected[target]] =
    [selected[target], selected[index]];

  renderSelected();
  renderPreview();
}

// 画像読み込み
function loadImage(character) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);

    img.onerror = () => {
      reject(
        new Error(`${character.filename} を読み込めません`)
      );
    };

    img.src = imagePath(character);
  });
}

// プレビュー描画
async function renderPreview() {
  const currentVersion = ++renderVersion;

  if (!selected.length) {
    canvas.width = 1;
    canvas.height = 1;
    return;
  }

  const columns = Math.max(
    1,
    Math.min(30, Number(columnsInput.value) || 1)
  );

  const scale = Math.max(
    10,
    Math.min(300, Number(scaleInput.value) || 100)
  ) / 100;

  isRendering = true;
  downloadButton.disabled = true;

  try {
    const images = await Promise.all(
      selected.map(loadImage)
    );

    // 描画中に選択内容が変わった場合は古い処理を破棄
    if (currentVersion !== renderVersion) {
      return;
    }

    // サイズを整数pxに丸める
    const sizes = images.map(img => ({
      width: Math.max(1, Math.round(img.naturalWidth * scale)),
      height: Math.max(1, Math.round(img.naturalHeight * scale))
    }));

    const rowCount = Math.ceil(images.length / columns);
    const rowHeights = [];
    const rowWidths = [];

    // 各行の高さと幅を計算
    for (let row = 0; row < rowCount; row++) {
      const start = row * columns;
      const end = Math.min(start + columns, images.length);
      const rowSizes = sizes.slice(start, end);

      rowHeights.push(
        Math.max(...rowSizes.map(s => s.height))
      );

      rowWidths.push(
        rowSizes.reduce((sum, s) => sum + s.width, 0)
      );
    }

    // Canvasサイズ
    canvas.width = Math.ceil(Math.max(...rowWidths));
    canvas.height = Math.ceil(
      rowHeights.reduce((sum, h) => sum + h, 0)
    );

    // 背景は透明
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 補間による縁のにじみを抑える
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let y = 0;

    // 画像を隙間なく配置
    for (let row = 0; row < rowCount; row++) {
      let x = 0;

      const start = row * columns;
      const end = Math.min(start + columns, images.length);

      for (let i = start; i < end; i++) {
        const size = sizes[i];

        // 各行の下端を揃える
        const bottomOffset = rowHeights[row] - size.height;

        ctx.drawImage(
          images[i],
          x,
          y + bottomOffset,
          size.width,
          size.height
        );

        // 次の画像を直前の画像のすぐ隣に配置
        x += size.width;
      }

      y += rowHeights[row];
    }

  } catch (error) {
    console.error(error);
    alert(error.message);

  } finally {
    if (currentVersion === renderVersion) {
      isRendering = false;
      downloadButton.disabled = false;
    }
  }
}

// PNG保存
async function downloadPNG() {
  if (!selected.length) {
    alert("キャラクターを選択してください");
    return;
  }

  // 描画が完了するまで待つ
  if (isRendering) {
    alert("画像を準備中です。少し待ってから保存してください。");
    return;
  }

  const link = document.createElement("a");
  link.download = "character-grid.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// イベント設定
searchInput.addEventListener("input", renderCharacters);

previewButton.addEventListener("click", renderPreview);

columnsInput.addEventListener("change", renderPreview);
scaleInput.addEventListener("change", renderPreview);

downloadButton.addEventListener("click", downloadPNG);

// 初期化
loadCharacters();
