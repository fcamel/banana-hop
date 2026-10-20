# AI、快速模擬與 Replay

瀏覽器遊戲、規則 AI 與 Node 模擬共用 `dist/` 的實際遊戲邏輯。沒有另寫簡化版碰撞或降低敵人數量；NN／PPO 訓練入口見 [NN_TRAINING.md](NN_TRAINING.md)。

## 瀏覽器操作

先用 `BANANA_AI_REPLAY=1 npm start` 啟動本機 server，再於主選單、暫停或結算畫面展開「AI 與 Replay」，勾選「AI 自動操作（規則版）」後開始。可指定 Seed；四個關卡入口都適用。規則版只是基礎控制器，會鎖定目標、搶瓶、跳踩與避障，不保證過關。控制器記憶每場獨立，抵達後會停步，避免因目標距離接近或略微越過目標而反覆折返；重開會清除記憶。大法師戰會先起跳再接近、等待法師無敵與護盾結束，並繞過沿途小兵；仍不保證每場都能過關。

未設定環境變數時，三個畫面的 AI／Replay 入口、狀態文字、錄製／下載／匯入與 AI 啟動均關閉；GitHub Pages 使用預設關閉的靜態設定。環境變數只影響瀏覽器功能，不限制下方的 Node 模擬 API／CLI。

開啟開發旗標後，手動與 AI 每局都自動暫存 Replay，結束後按「下載 Replay」。開始新局才清除上局；暫停或回主選單仍保留，重新載入頁面會清除。也能用「播放 Replay」匯入由命令列產生的 JSON。P 可暫停；播放結束會核對錄製結果，出現不同步會停止並顯示錯誤。

Replay 使用錄製時的邏輯 viewport 與手機倍率，畫面縮放呈現，因此在不同螢幕上播放不會改變出兵與碰撞規則。這是遊戲狀態重演；裝飾粒子、晃動與聲音不要求逐像素相同。

## 訓練結果儀表板

開啟本機 `/training/` 可追蹤每代分數與點擊突破 Replay；提供 CLI、Python 與 HTTP 記錄介面，`npm run training:nn` 的 PPO 訓練會自動寫入。Replay 共用最多 100 檔／100 MB 配額，固定保留各次訓練的初代；分數歷史不輪替。設定與使用方式見 [TRAINING_DASHBOARD.md](TRAINING_DASHBOARD.md)。

## 不繪圖模擬

Node.js 22 以上即可，不需要瀏覽器、Canvas、Web Audio、圖檔解碼或額外 npm 套件。`sim/environment.cjs` 在獨立 VM 中載入相同遊戲程式，提供最小的介面相容層；跳過顯示、素材預備及音樂生成，直接推進遊戲時間。

```sh
# 一般批次模擬：只輸出統計，不錄 replay
npm run simulate -- --mode milk --episodes 20 --seed 1 --seconds 180

# 偶爾挑一場錄製，之後可在遊戲中匯入觀看
npm run simulate -- --mode milk-boss --seed 42 --seconds 60 --record /tmp/banana-replay.json

# 不繪圖驗證 replay
npm run simulate -- --replay /tmp/banana-replay.json
```

模式沿用 `milk`、`milk-boss`、`survival`、`boss`。多場模擬依序使用 seed、seed+1…；`--record` 只允許單場。`--seconds` 是包含開場與魔王演出的模擬時間上限，不是牆鐘等待時間。到上限仍未結束時，輸出 `truncated: true`；不把截斷當成過關或死亡。錄下的部分 replay 也可播放至該處。

## 控制器介面

```js
const {createEnvironment} = require('./sim/environment.cjs');
const env = createEnvironment({mode: 'milk', seed: 7, record: false});
let observation = env.observe();
while (env.summary().outcome === 'running' && env.summary().steps < 10800) {
  const action = env.policy(observation); // 未來可替換為 neural network 推論
  const result = env.step(action, 6);     // 動作保持至多 6 個物理步長
  observation = result.observation;
  // result.reward、result.terminated、result.info 可供訓練迴圈使用
}
```

- `reset()`：同設定與 seed 重開，回傳初始 observation。
- `observe()`：取得可序列化、與遊戲物件分離的狀態。包含主角、敵人、道具、彈體、巨人跳板與魔王狀態；目前提供全場資訊，並非從畫面辨識或限定視野。
- `step(action, frames)`：回傳 observation、reward、terminated 與統計；已結束時不再推進。訓練的時間上限由呼叫端管理，與遊戲的過關／死亡分開。
- 動作：`{x, y, jump, jet, dash, surf}`。移動軸為 -1～1，對角線由遊戲既有規則正規化；jump／dash／surf 是每步提出動作請求，jet 是保持噴射。仍遵守跳躍、能量與凍結限制。
- `features(observation)`：提供固定長度、有限數值的 Float32Array 基礎特徵。模型也可自行編碼完整 observation；更換特徵契約時需同步更新模型。
- `policy(observation)`：內建基礎 rule-based 控制器。策略只讀取 observation、輸出 action，不直接修改世界。
- `summary()`：步數、時間、血量、擊殺、勝負與累計 reward。
- `replay()`：僅 `record: true` 可用；一般訓練不建立動作歷史。

Reward 是可替換的基準訊號，不是遊戲分數或既定最優目標。現行定義請見 [GAMEPLAY.md](GAMEPLAY.md)。先維持結構化介面，之後可加 Python／模型推論的連線層；NN 使用帶參數技能控制器 `sim/skills.cjs`；專用契約、PPO 與批次 worker 已在 `sim/training.cjs`、`sim/ppo.cjs` 和 `sim/training-worker.cjs` 實作。`survivalOnly:true` 僅允許 milk，60 秒直接結束，reward 替換為有效存活秒數，step 回傳 `truncated:false`；一般呼叫端若提早停止須區分截斷與真正終止；目前 NN 訓練器會完成當前 episode，使用實際 Monte Carlo 回報，不 bootstrap。

每個 Node environment 有獨立 VM，可在呼叫端分派至 worker／多程序；一般 simulate CLI 依序執行，NN 訓練 CLI 使用長駐 worker 批次併行。瀏覽器頁面一次只有一個世界。一般 `reset` 重建遊戲；NN 訓練另有 Node 專用世界快照，直接恢復中局與突破盤面。原 Replay 匯入先驗證，快照保留完整物理狀態、RNG 及共享引用，突破起點僅補 HP；不提供瀏覽器任意狀態載入。詳見 NN_TRAINING.md。

## 可重現性與檔案格式

`dist/control.js` 管理 seed、固定時間步長、動作、觀察與錄放。遊戲隨機數與畫面／音效隨機數分開，因此多畫幾幀不會改變戰局。AI／replay 在步與步之間統一座標及角度精度，避免不同 JS 引擎版本的微小浮點誤差經密集碰撞放大；精度規則見 GAMEPLAY.md。旗標關閉的玩家手動模式仍沿用既有輸入與更新節奏；旗標開啟時，手動操作也採固定步長錄製。

Replay JSON 包含 schema、規則版本、遊戲來源 SHA-256、seed、viewport、手機倍率、開場選項、固定步長、總步數、壓縮過的動作區段與最終狀態校驗。相同動作連續出現時只存一次並累計步數，不儲存影片或逐步世界快照。

Replay 只支援與錄製時**完全相同的遊戲程式來源**；改過遊戲後不能保證舊檔仍能播放，工具會拒絕不符的來源版本。需要長期保留時，請連同對應 Git commit 保存。載入會檢查格式、數值與步數，執行結束再核對狀態及遊戲 RNG；不會靜默忽略不同步。

Node 模擬可重用已編譯腳本與同 profile 的 VM；以不同 seed 重設仍建立新的遊戲環境。`restoreTape` 按 Replay 相同輸入區段批次呼叫原物理迴圈（每批最多 600 步），物理步長、逐步 RNG 與碰撞不變，尾端由原重播驗證器校驗；只把最後兩幀交給 NN 可見速度估計。一般 Replay 播放介面與檔案格式不變。

Node `createEnvironment().metrics()` 提供實際牛奶瓶、香蕉串、滑板取得數及牛奶噴射秒數；重開／快照還原後重新計數，Replay 重演則累積該段實際事件。計數不改 observation、reward、物理或 Replay；訓練暖機前綴的計數另行排除，詳見 [NN_TRAINING.md](NN_TRAINING.md)。
