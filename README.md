# 香蕉踩香蕉 · Banana Hop

電腦與手機皆可遊玩的 Canvas 2.5D 香蕉生存遊戲，包含兩個獨立關卡：

- **蕉片崛起**：與香蕉片搶牛奶瓶、使用噴射背包，生存後挑戰香蕉片巨人。
- **蕉皮末日**：跳踩香蕉、閃開蕉皮，生存後挑戰腐蕉大法師。

兩關皆為「小兵關 → 魔王戰」，勝利後結算，不互相接關。主選單也提供「蕉片崛起 (魔王戰)」與「蕉皮末日 (魔王戰)」直接挑戰入口。

## 文件入口

- [GAMEPLAY.md](GAMEPLAY.md)：所有玩法規則、數值、生成公式、道具、魔王階段與動畫時序。
- [AGENTS.md](AGENTS.md)：任何 agent 開新 session 時應遵守的工作慣例。
- [DEPLOYMENT.md](DEPLOYMENT.md)：版號、驗證、commit／push／GitHub Pages 發布與失敗處理。
- [CHANGELOG.md](CHANGELOG.md)：各版本的重要更新與重大 Bug 修正。
- [SIMULATION.md](SIMULATION.md)：AI 自動操作、無畫面模擬、訓練介面與 Replay。
- [TRAINING_DASHBOARD.md](TRAINING_DASHBOARD.md)：本機每代分數曲線、突破 Replay 與容量限制。
- [NN_TRAINING.md](NN_TRAINING.md)：可執行的 NN／PPO 生存訓練、checkpoint 續訓與自動 Replay。

預設只做 local 開發。明確要求發布時才進行對應動作；版號預設升 patch，詳見發布文件。

## 本機啟動

需要 Node.js 22 以上與 Python 3。遊戲沒有 npm 套件依賴，已提交的 WebP 可直接使用，不需要先建置。

```sh
npm start
```

開啟 <http://127.0.0.1:8893/>。AI／Replay 是預設關閉的開發功能；本機測試請明確啟用：

```sh
BANANA_AI_REPLAY=1 npm start
```

local server 只在記憶體回傳啟用設定，不改寫 `dist/features.js`；GitHub Pages 部署保持關閉。主選單、暫停、結算畫面的入口皆受相同開關控制。

手機遊玩可用 `BANANA_AI_REPLAY=1 python3 scripts/serve.py --bind 0.0.0.0`，以手機開啟電腦區網 IP。手機需橫向遊玩，支援的瀏覽器需進全螢幕。若該瀏覽器要求安全來源才能使用全螢幕／方向鎖定，改用 HTTPS 測試；未支援原生全螢幕時採滿版網頁。

## 操作與測試

WASD／方向鍵移動，Space 跳踩／持有牛奶瓶時按住噴射，J 旋轉衝刺，K 蕉皮衝浪，P／Esc 暫停；手機使用搖桿與按鈕。主選單輸入 `banana` 開啟隱藏除錯選單。

```sh
npm run check
npm test
```

## 專案結構

```text
AGENTS.md                   Agent 工作慣例
GAMEPLAY.md                 遊戲設計與參數
DEPLOYMENT.md               版號與發布操作
CHANGELOG.md                重要版本更新與 Bug 修正
.github/workflows/pages.yml 檢查、WebP 生成與 Pages 部署
dist/                       可直接執行與部署的完整遊戲
  game.js                   主迴圈、玩家、小兵、碰撞與一般音樂
  boss.js                   腐蕉大法師 AI、過場與專屬音樂
  giant.js                  香蕉片巨人、護盾與補片
  milk.js                   香蕉片、牛奶瓶與噴射背包
  entrance.js               香蕉盒開場
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
