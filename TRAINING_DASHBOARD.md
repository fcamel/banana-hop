# 本機訓練觀察室

這是訓練結果的記錄與觀看工具，已接上 `npm run training:nn` 的 CPU NN／PPO 訓練器，使用方式見 [NN_TRAINING.md](NN_TRAINING.md)。第一代是未更新的 NN 基準；之後每代代表一次模型更新後、用固定 seeds 進行的一組評估，不是單一 episode。

## 開啟

```sh
BANANA_AI_REPLAY=1 npm start
```

開啟 <http://127.0.0.1:8893/training/>，或由遊戲「AI 與 Replay」內的「訓練儀表板」進入。主選單、暫停與結算共用該入口。環境變數未開啟時，本機儀表板與 API 都回傳 404。HTML／JS／CSS 位於 `tools/training/`，不會包含在 GitHub Pages 的 `dist/` 發布檔案裡。

儀表板每 3 秒更新；顯示平均／單局最高存活秒數曲線、每代最低／最高、60 秒達成率及樣本數。可篩選有 Replay 的代數、點曲線圓點或表格按鈕直接播放，並暫停、繼續、重新播放及下載。播放使用錄製時的 viewport 與手機倍率，不重新執行 NN；Replay 的校驗結果及錯誤會顯示在播放器上方。

## 先試一筆真實基準

```sh
npm run training:baseline
# 自訂名稱、seed，或縮短測試：
npm run training:baseline -- --run-id rule-test --seed 7 --seconds 15
```

這會實際用規則 AI 跑一場「蕉片崛起」，最多生存 60 秒，不繼續打 Boss；記錄第 1 代及 Replay，清楚標記為「規則 AI 基準（非 NN）」。不生成虛構分數，也不代表已訓練 NN。重複使用同一 runId 的第 1 代會被拒絕；預設 runId 自動帶時間。

## 保留與容量

- 分數歷史保存在 `.training/metrics.sqlite3`，不隨 Replay 輪替刪除。
- Replay 位於 `.training/replays/`；**所有訓練合計最多 100 個檔案、總計 100,000,000 bytes（100 MB）**，兩個限制獨立執行，不假設每檔固定 1 MB。
- 每次訓練的第 1 代固定保留。單次訓練通常是第 1 代加最近 99 個突破；多次訓練共用配額。
- 每批（runId）的四場（或該批指定場次）平均存活秒數只要創歷史新高就保存代表 Replay，不再有 10 檔或顯著增幅門檻。等分與退步不保存；比較使用該批全部歷史平均，含未保存／已輪替的代數，浮點比較容差為 1e-9 秒。各批仍共用容量上限。新規則只影響後續寫入，先前未保存的 Replay 無法由分數還原。
- 其餘 Replay 依寫入先後移除最舊的突破，直到符合檔數與 bytes 上限；統計仍可看見，表格標示「已輪替移除」。不會為了新檔刪除任何初代基準。
- 若所有固定基準加新檔已超過配額，拒絕此次寫入並顯示錯誤，既有基準保留。若已累積 100 個不同訓練的固定初代，需先整理舊訓練資料或另設資料目錄，才能再加入新基準。
- `.training/` 已加入 gitignore；不 commit、push 或上傳訓練資料。可在 server 與記錄程序設定相同的 `BANANA_TRAINING_DIR=/absolute/path` 更換資料目錄。

總容量上限針對 Replay 資料夾；分數資料庫另計。檔案寫入前先騰出空間，寫入中斷留下的工具暫存檔會在下次開啟資料庫時清理。多程序記錄使用檔案鎖序列化，重複代數不會覆寫檔案。不要將其他私人檔案放進工具管理的 Replay 目錄。

## 接入訓練器

每代評估使用相同且順序固定的 seeds；`scores[i]` 是對應 `evaluationSeeds[i]` 的有效存活秒數（0～60），排除開場動畫。挑一個具代表性的 episode，例如該代最高分場次，連同其 Replay 送入。曲線上的分數是整代平均，播放器會另外顯示該段 Replay 的單局分數，兩者不要混淆。

`generation.json` 範例（示意資料，需搭配分數相符的真實 Replay）：

```json
{
  "runId": "ppo-milk-001",
  "name": "蕉片崛起 PPO 01",
  "trainer": "PPO / NN",
  "generation": 1,
  "evaluationSeeds": [7, 11, 19],
  "scores": [18.5, 21.2, 16.8],
  "config": {"objective": "survival-seconds", "viewport": [1000, 650], "mobile": false}
}
```

三種寫入方式使用同一套保留規則：

```sh
npm run training:record -- generation.json --replay representative.json
```

```python
# 從專案根目錄執行；同一程序也可直接 import，不必每代重啟 server。
from scripts.training_store import TrainingStore

result = TrainingStore().record_generation(generation_record, representative_replay)
```

或 POST `http://127.0.0.1:8893/training/api/generations`，Content-Type 為 `application/json`；JSON 為上述 generation 內容加上 `"replay": {完整 Replay 物件}`。成功回傳 201 與 `reason`（`baseline`／`breakthrough`／`score-only`）、保留檔名與用量；格式或配額錯誤回傳 400 並說明原因。

第 1 代必須從 1 開始，後續代數必須連續。舊 `breakthroughSeconds`／`breakthroughRatio` 欄位仍可讀取／驗證，以相容既有資料庫與輸入，但不再限制新高的保存；既有訓練也直接使用新規則，不需重建 run。

未達保存條件的代數可省略 Replay，只記分數；第 1 代及符合保存條件的新高若未提供 Replay 會拒絕寫入，不會悄悄丟失應保留的場次。訓練器可以暫存代表場次的操作，確定需要保留時才傳送／寫入。此處的觀看 Replay 與 PPO 訓練所需的 rollout buffer 是不同資料。

相同 runId 不允許變更遊戲來源、評估 seeds 或 `config`；需另開 runId，避免無法比較的分數混成一條曲線。檔案寫入時檢查 Replay 來源版本、格式、seed 及單局分數；播放時再實際重演並驗證最終狀態。舊版本 Replay 保留下載，但儀表板停用直接播放，需切回對應 commit。

本工具不替訓練器驗證模型是否為 NN，也不保證上報平均分數可信；`trainer` 應據實填寫，評估與 survival-only 的規則需由訓練器實作。訓練方式見 [NN_TRAINING.md](NN_TRAINING.md)，現有模擬 API 見 [SIMULATION.md](SIMULATION.md)。
