# 香蕉踩香蕉 · Banana Hop

電腦與手機皆可遊玩的 Canvas 2.5D 香蕉生存遊戲：跳踩香蕉、閃開蕉皮，撐過生存階段後擊敗腐蕉大法師。

## 文件入口

- [GAMEPLAY.md](GAMEPLAY.md)：所有玩法規則、數值、生成公式、道具、魔王階段與動畫時序。
- [AGENTS.md](AGENTS.md)：任何 agent 開新 session 時應遵守的工作慣例。
- [DEPLOYMENT.md](DEPLOYMENT.md)：版號、驗證、commit／push／GitHub Pages 發布與失敗處理。

預設只做 local 開發。明確要求發布時才進行對應動作；版號預設升 patch，詳見發布文件。

## 本機啟動

需要 Node.js 22 以上與 Python 3。遊戲沒有 npm 套件依賴，已提交的 WebP 可直接使用，不需要先建置。

```sh
npm start
```

開啟 <http://127.0.0.1:8893/>。等同：

```sh
python3 -m http.server 8893 --bind 127.0.0.1 --directory dist
```

手機試玩可將 bind 改為 `0.0.0.0`，以手機開啟電腦區網 IP。手機需橫向遊玩，支援的瀏覽器需進全螢幕。若該瀏覽器要求安全來源才能使用全螢幕／方向鎖定，改用 HTTPS 測試；未支援原生全螢幕時採滿版網頁。

## 操作與測試

WASD／方向鍵移動，Space 跳踩，J 旋轉衝刺，K 蕉皮衝浪，P／Esc 暫停；手機使用搖桿與按鈕。主選單輸入 `banana` 開啟隱藏除錯選單。

```sh
npm run check
npm test
```

## 專案結構

```text
AGENTS.md                   Agent 工作慣例
GAMEPLAY.md                 遊戲設計與參數
DEPLOYMENT.md               版號與發布操作
.github/workflows/pages.yml 檢查、WebP 生成與 Pages 部署
dist/                       可直接執行與部署的完整遊戲
  game.js                   主迴圈、玩家、小兵、碰撞與一般音樂
  boss.js                   魔王 AI、過場與專屬音樂
  surf.js                   蕉皮衝浪與滑板
  index.html / style.css    介面與樣式
  assets/                   PNG 原圖與 WebP 發送貼圖
scripts/optimize-assets.py   貼圖縮圖、透明 WebP 生成
scripts/version.cjs         版號、主選單與快取鍵同步
tests/game.test.cjs         Node.js 遊戲回歸測試
art/                       素材提示詞與參考預覽
```

原生 HTML、JavaScript、CSS、Canvas 與 Web Audio，無執行期外部服務。貼圖原圖與生成提示詞保留在專案內；音樂與音效即時合成。修改原圖後須重新產生 WebP，方法見 [DEPLOYMENT.md](DEPLOYMENT.md)。

正式站點：[香蕉踩香蕉](https://fcamel.github.io/banana-hop/)。推送 `main` 會自動觸發 GitHub Pages 部署。
