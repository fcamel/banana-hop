# AI 能力診斷與公平基準

本工具用於定位問題，不更新 NN weights，不寫入訓練 dashboard 的代數，也不改正式遊戲。實驗方向見 [NN_AI_REVIEW.md](NN_AI_REVIEW.md)。

第一輪結果與建議見 [NN_AI_BASELINE_RESULTS.md](NN_AI_BASELINE_RESULTS.md)。

## 執行方式

```sh
npm run training:diagnose-abilities -- \
  --checkpoint .training/models/ppo-desktop-region-directions-v1/best.json \
  --checkpoint .training/models/ppo-desktop-regions-two-hp-v3/best.json \
  --checkpoint .training/models/ppo-desktop-attention-validation-v2/best.json
```

每個策略跑 20 個短場景與 4 場完整 60 秒上限的蕉片崛起；不進 Boss 戰。`--episodes 16` 可增加完整評估場數；`--split development` 使用另一組距離與 seeds；`--output PATH` 改輸出位置。預設 `test` 留作診斷比較，不能把其結果拿去反覆挑選訓練 checkpoint。所有策略使用相同場景、遊戲 seeds、桌機 1000×650 viewport。NN 使用固定 policy seed 的抽樣策略，不用 greedy；規則策略為確定性。

結果在 `.training/diagnostics/<時間>/report.json` 與 `summary.md`。完整 JSON 包含逐決策、損血原因、當時與前兩次決策、技能曝露秒數、輸入改變延遲與 Replay 路徑。歷史訓練紀錄保持不動。

## 比較的策略

- **idle**：不操作的負對照，確認場景真的會造成威脅。
- **visible-skills**：只接受 NN 的同一份編碼 feature vector 與合法動作遮罩；沿用同一技能控制器與決策交還時間。以可見運動線性估算風險，不讀引擎的未來落點、畫面外敵人、隱藏目標或 RNG。
- **visible-primitive**：同樣的規則評分，但每 0.1 秒重新選擇並輸出基本按鍵。這是反應與控制方式的探針，不能將它與 NN 的分數差直接歸因於 NN weights 或僅歸因於反應頻率。
- **指定的 NN checkpoints**：固定 weights，讀取原有 observation contract。讀取時核對 source digest、contract 與參數形狀；允許跨訓練實作版本的唯讀評估，不代表允許跨版本續訓。

規則基準仍有手寫偏好，例如接近牛奶、估計短期碰撞、避免撞牆。它不是最佳策略上限，也不替 NN 加上防呆。原本讀完整世界的 rule-based AI 保留原樣，但不混入這份公平比較。

## 四類能力場景

| 類別 | 變化 | 成功定義 |
| --- | --- | --- |
| 子彈 | 左／右各一發或五發扇射 | 4 秒內不損血 |
| 蕉片 | 地面、上升、下降、飛射；左右鏡像 | 5 秒內不損血 |
| 角落 | 四個角落，各三片向玩家逼近 | 6 秒結束時離開兩側邊界至少 180 單位 |
| 取瓶 | 左／右瓶子；安全／途中有子彈 | 6 秒內實際取得牛奶瓶 |

全部從真實遊戲 snapshot 建立初始場景，只清除無關物件並停用自然生兵；之後照常執行原有移動、合體、攻擊與碰撞。各策略都在相同物理步截止，不把未完成短場景視為死亡或勝利。角落成功不代表全程無傷；取瓶成功也不代表安全，須一起看損血數。這些是基本能力探針，不足以證明能應付後期密集彈幕或任意場景。

## 診斷欄位的意義

- `bySkill.seconds`：真正執行的物理時間；`hitsPerSecond`、`hitsPerDecision` 避免單看總損血次數誤判常用技能。
- `controllableSeconds`、`vulnerableSeconds`：可轉向與非無敵時段分別計算。這些仍是統計關聯，不能認定某技能造成死亡。
- `damage`：實際 HP 下降事件，附原因、位置、決策後多久受傷、受傷前是否可轉向、最近三個決策。
- `responses.estimatedImpactIn`：用當下可見位置與速度作的最長 0.6 秒線性估計；不是引擎碰撞真相。
- `nextChangedChoiceAfter`：後續 skill／direction／target slot／travel 何時不同。slot 可能因排序改變，因此不能當作真正識別威脅的時間。
- `firstChangedInputAfter`：估計威脅出現後，移動輸入向量變化超過 0.2，或起跳／噴射／大絕／衝浪按鍵開始的時間差。自動追蹤轉向也可能觸發，故只能稱為操作反應，不等於策略理解威脅。
- `blockedSeconds`：可轉向、持續要求移動、位於邊緣但幾乎沒位移的時間，供找出撞牆案例。

## Replay 與儲存限制

每個策略保留每類的第一場 Replay，並在寫檔前完整重跑驗證。完整開局場使用標準 Replay，可從遊戲開發模式的 Replay 匯入播放。

人工短場景需要初始 snapshot，使用獨立 `banana-hop-diagnostic-v1` 格式，**目前只支援 Node 精確重播，不支援瀏覽器匯入**：

```sh
npm run training:diagnose-abilities -- --replay .training/diagnostics/replays/實際檔名.json
```

兩種 Replay 都存於 `.training/diagnostics/replays/`，全目錄最多 100 檔、100 MB；單檔超過 1 MB 就不留，報告會記錄。刪除最舊檔後舊報告的連結可能失效。報告與訓練 checkpoint 不算 Replay，不受此保留上限控制。

## 判讀與下一步門檻

1. 先確認負對照會中招、鏡像場景與 Replay 一致、隱藏資訊變動不影響策略輸入。
2. 看 NN 在簡單場景是否比不操作更好；看能力缺口是避彈、空中目標、角落還是取瓶。
3. 較快反應基準若有優勢，下一批只改 NN 決策頻率／中斷機制，固定其餘架構、資料與評估條件，再作比較。
4. 基本能力過關而完整遊戲失敗，再檢查課程覆蓋與密集場景，而不是直接增加網路層數。
5. 四場完整評估只用於初篩；要決定正式訓練方向，需更多獨立遊戲 seeds、policy seeds 與配對結果，不能只看最高分。

## 擴大抽樣／greedy 配對評估

```sh
npm run training:evaluate-paired -- \
  .training/models/ppo-desktop-region-directions-v1/best.json \
  .training/models/ppo-desktop-regions-two-hp-v3/best.json \
  .training/models/ppo-desktop-attention-validation-v2/best.json
```

固定使用 16 個新遊戲 seeds（`0xd3000000`～`0xd300000f`），每個 NN 每個 seed 跑兩次不同 policy seed 的抽樣，以及一次 greedy。Greedy 依現行條件式 heads，依序選各 head 最高機率的合法值，不保證是聯合動作機率的全域最大值。規則＋原技能基準每個 seed 跑一次；指定三個 NN 時合計 160 場。僅跑完整生存關卡，不重跑人工短場景。

JSON 輸出到 `.training/diagnostics/paired-<時間>/report.json`，每四場保存進度。保存 checkpoint SHA-256，結束後再次核對，並記錄 `weightsUnchanged`。不寫訓練代數、不更新 weights，也不新增 Replay 檔案。`runCase` 的 `policySeed` 與遊戲 `seed` 分開，且 `greedy` 明確記錄在每場結果。

抽樣模式先將同一遊戲 seed 的兩次成績平均，再按遊戲 seed 作 4,000 次 bootstrap，提供平均值的近似 95% 區間。配對差是每個遊戲 seed 的「greedy 秒數 − 兩次抽樣平均秒數」。這個區間衡量這批遊戲 seeds 的變異；兩次 policy seeds 仍很少，且不能涵蓋不同訓練初始化造成的模型差異。不得把重複執行相同固定 seeds 當成新的獨立驗證資料，也不能只挑分數較高的模式宣稱已改善訓練。

## 決策交還頻率單因子實驗

```sh
npm run training:diagnose-redecision -- .training/models/ppo-desktop-attention-validation-v2/best.json
```

固定 G50 weights、可見特徵、合法動作及技能控制器，只以診斷選項 `diagnosticRedecisionFrames` 對照原上限 30 幀（0.5 秒）與 12 幀（0.2 秒）。原本比上限短的技能仍保留自己的時長；相同技能／目標的延續不重設累積執行時間。物理仍每秒 60 幀、底層控制更新仍每 6 幀，不加自動躲避。正式預設保持 30 幀。

先跑既有 20 個短場景，NN／同可見資訊規則各兩種頻率；再以 32 個新 seeds `0xe8000000`～`0xe800001f`，固定 NN 各跑完整 60 秒生存關，共 64 場。使用 greedy 避免不同決策次數額外改變操作抽樣串流。記錄決策次數、耗時與配對存活差；不能把既有技能基準與原始按鍵基準的差異混入本比較。

這是固定舊策略的控制頻率探針，不代表該策略已為 0.2 秒重新訓練。較頻繁決策可能改變技能／目標切換、每秒推論次數與觀察序列；沒有新增可見範圍、隱藏資料或未來預測。短場景各存一份飛射情境的原始操作 Replay 並驗證重播，置於本機報告目錄。

## 隔離避彈課程（僅診斷）

`npm run training:diagnose-dodge-course -- single` 或 `-- cross`：由保留的 G50 起跑，三個獨立訓練 seeds，各 10 輪、每輪至少 256 次決策並收完最後一場。既有技能與 0.5 秒決策上限不變，PPO 每輪最多 2 epochs、mini-batch 64。額外 `--actor-only` 只關閉 value loss；共用表徵仍會由 actor 更新，不能稱為凍結 critic。

課程盤面只改初始狀態：可見 1 HP、單一或三方向交叉牛奶彈、無增兵與補給。真實遊戲碰撞、傷害和移動不變；存活到 4 秒就是課程成功終點，死亡立即結束。reward 為實際存活秒數，使用完整回報、不 bootstrap；它不是完整 60 秒遊戲的回報，不可混為一談。短課程的回報尺度可能干擾原先 critic，所以另設關閉 value loss 的對照。

模型仍只收既有可見物件／主角欄位，沒有未來位置、最優方向標籤、自動避彈或額外課程答案。初始彈速、距離、扇射數量變化；保留測試用錯開的角度，訓練不使用測試結果選 checkpoint。每組固定評估第 10 輪：64 個保留案例，再以 8 個配對 seeds 測原始完整關卡。此樣本只作小步篩選，不支持穩定改善的廣泛結論。

產物在忽略的 `.training/diagnostics/dodge-course-*`。權重使用獨立診斷 schema，保留原模型 hash，不可直接當成正式 PPO resume checkpoint。沒有改正式遊戲、預設訓練流程或啟動 100 代。

## 實戰失敗片段稽核

`npm run training:diagnose-failures` 固定原 G50、greedy，與相同可見資訊規則策略跑 16 組新的配對 seeds。`node scripts/summarize-failures.cjs DIRECTORY` 彙整報告。只作觀察，不改策略、reward、控制器或遊戲。

每次決策記錄模型輸入解碼後的可見物件、目標位置／高度、技能、方向，以及隨後真實執行的幀數、位移、跳躍請求、結束原因。損血使用遊戲既有事件；以前閉後開的時間歸屬原則，損血歸到實際造成它的執行區間，不把同時刻下一個決策當成事前行為。保留前 2 秒決策索引及原有三動作歷史。

`report.json` 存每場摘要，`analysis.json` 存彙整與每次損血對齊，`*.trace.json` 可追查完整決策，`*.replay.json` 是已驗證精確重播的標準 Replay。皆在忽略的 `.training/diagnostics/failure-audit-*`，不進發布資產。

限制：傷害事件只有原因類型，沒有攻擊物件 ID；可見的子彈不一定就是最後命中的子彈。線性風險估計只是輔助描述，不是碰撞真值，也不會輸入模型。受傷率按技能時間呈現，但技能選擇會受盤面危險程度影響，不能由相關性宣稱技能本身造成受傷。

## 左右鏡像與固定模型對照

`npm run training:diagnose-mirror` 在 16 場固定 greedy NN 實戰中，每至少 0.5 秒取一個可控制盤面。只將當下可見輸入做左右反射：主角／物件 x、水平速度、水平擊退與漂移、左右邊界、牛奶瞄準向量、上一動作方向與持續技能目標／方向同步轉換。高度、y、物件身分及按距離排序的 slots 不變，空白 slots 保持空白。合法方向遮罩也反射。沒有建立未來盤面或讓鏡像預測控制這些採樣軌跡。`node scripts/summarize-mirror.cjs DIRECTORY` 產生統計；TV 區間以場次為重抽樣單位，不把相鄰盤面當獨立場次。

單元測試以獨立反射的 observation 重新 encode 比對整份向量，涵蓋各物件種類、速度、邊界、持續技能及歷史；兩次反射回到原輸入、不修改原陣列。只做左右而不任意上下翻轉，避免斜視投影、高度及畫面可見範圍破壞對稱性。

`npm run training:evaluate-mirror` 用另一批 16 seeds，比較原模型與左右鏡像 joint-policy mixture。後者各看一次原輸入／鏡像輸入，翻回方向後，將兩個完整動作分布等權合併。逐 head 選擇時，依已選技能／方向／目標更新兩個分支的後驗權重，不能把每個 head 獨立平均冒充 joint mixture。仍以原有逐 head greedy 方式選動作；完全平手時索引先後可能打破 greedy 的對稱性，分布本身的對稱性與單次 greedy 動作需分開看。

這是純推論診斷包裝，不改 NN weights／reward／技能／碰撞／正式控制入口，不提供額外視野或答案。不支援直接拿包裝器作 PPO 更新。記錄存於忽略的 `.training/diagnostics/mirror-*`／`mirror-eval-*`。

## 落地前後與事件式決策探針

`npm run training:diagnose-landings -- FAILURE_AUDIT_DIRECTORY` 逐幀重播已有稽核資料，保留受傷前 0.5／0.3／0.1 秒的實際輸入、主角高度／垂直速度、技能，以及當時可見的同類威脅。速度由可見歷史估計，不讀 flight 終點。水平接近預測只使用線性速度與標稱移速，不含高度碰撞、擊退或噴射模型，不是安全路線真值。`node scripts/summarize-landings.cjs DIRECTORY` 彙整。

**受傷歸零不是落地。** `hurt()` 會將 z/vz 設零，分析必須使用 damage event 的受傷前高度。回歸覆蓋「空中受傷不應被當成剛落地」。這是診斷資料修正，沒有修改遊戲受傷機制。

`npm run training:evaluate-landing-decision -- SEED_BASE` 跑 16 個配對 seeds。固定原模型 greedy，只在實驗組開啟 Node 模擬的 `diagnosticLandingDecision`：當高度從 >1 降至 ≤1（遊戲允許起跳的高度）且同幀沒有損血，立即結束當前 option 並交還決策。原有 0.5 秒上限、其他技能／傷害／移動／觀察欄位不變。它不要求 NN 跳躍或選某個方向；只是可見的落地事件觸發一次新選擇。選項預設關閉，正式訓練與瀏覽器策略沒有啟用。

這也會重設剛結束 option 的狀態，下一次選相同技能可以視為新的動作；因此實驗是「落地結束舊動作並立即重選」的整體對照，不能把效果全部歸因於增加決策頻率。每場標準 Replay 都驗證至最終 digest；僅第一組留檔。來源模型 hash 保持不變，尚不自動推廣為正式設定或啟動長訓練。

### 落地時機與動作狀態的拆解

`npm run training:evaluate-landing-ablation -- SEED_BASE` 以固定 G50、16 個配對 seeds 跑四組；`node scripts/summarize-landing-ablation.cjs DIRECTORY` 彙整。

| `diagnosticLandingMode` | 決策時機 | 同技能／目標再次被選時 |
| --- | --- | --- |
| `off` | 原流程 | 原本的狀態延續規則 |
| `both` | 落地立即重選 | 舊 option 清除、新建動作（與先前 boolean flag 相同） |
| `decision` | 落地立即重選 | 保留舊 option，仍受原有到期／完成／中斷規則約束 |
| `reset` | 維持原本時序 | 若本次執行期間落地，下一次選擇不延續舊 option |

`reset` 在落地後仍繼續原控制器到正常決策點，沒有立即重新執行技能、沒有自動跳躍。`decision` 若保留的跳躍已自然結束，仍由既有控制器處理完成；四組是明確的操作性定義，不能假設所有技能的內部生命週期都可完全獨立拆分。改變 active option 也會改變模型既有的持續動作欄位，這屬於狀態處理這個因素，不是新增盤面資訊。

測試涵蓋四組在真正分岔前的物理狀態一致、reset 不提早交還、decision 保留 triggered／進度、both/reset 只有下一次被選才重新起跳。正式預設仍為 off，舊 `diagnosticLandingDecision:true` 對應 both。

每場記錄存活、決策數、擊殺、取得牛奶、全部受傷原因、落地後 0.2 秒內受傷數、落地次數及該窗口內可受傷的時間，並驗證 Replay。受傷窗口使用受傷前高度，排除 hurt 歸零誤判。統計同時報告原始次數與暴露時間；這些是實際軌跡的結果，不能把不同策略遇到的盤面當成相同。2×2 主效應與交互作用均為探索性配對 bootstrap，未作多重比較校正。

### 同盤面決策與執行診斷

`npm run training:diagnose-execution` 重跑 failure audit 的全部 32 場已記錄選擇，逐次核對 option 結果、玩家位置／高度／HP，並驗證標準 Replay。它不試跑替代未來、不訓練，也不把診斷分數交給 NN。

- 執行層：一般可控制幀，核對控制器輸入與引擎水平位移（205 單位／秒）。排除受傷、滑倒、擊退、大招、漂移及邊界 clamp，避免把合法物理效果當成故障；另外記錄地面跳躍請求是否上升。這只能查輸入有沒有被正常執行，不能證明跳踩會命中或路線安全。
- 選擇層：在原決策的同一份可見特徵，固定 move 或 evade 技能，比較合法方向的短期線性風險估計；排除無敵／硬直。估計只用可見位置、速度、高度，不能提供未來碰撞真相。差值大於 1 是報告用描述門檻，不是遊戲規則、獎勵或訓練標籤。
- 保存兩者的完整分母，不能拿不同軌跡的受傷差異當成同盤面反事實。規則策略本身使用同一套風險估計，因此其分數低屬預期，不能當成獨立驗證估計器正確。

### 距離、高度與跳躍階段的靜態探針

`npm run training:diagnose-skill-semantics` 使用固定 G50，不更新 weights。共 864 個人工可見觀察：八方位、三個時間點、三種主角跳躍階段；距離組使用單一地面蕉片與六種距離，高度組固定飛射旗標及觀測水平速度，改變三種高度。所有敵人均在 viewport 內，輸入仍走正式 encoder、合法遮罩與 policy，另檢查控制器第一步的實際請求。

物件速度由兩個可見觀察估計，不給終點／未來引擎狀態。探針不啟動引擎推演，人工盤面不加入訓練資料。固定 HP=2、無大招／牛奶／道具、無執行中 option、零上一動作欄位；這些條件可能偏離實戰分布，不能把結果稱為全部盤面的成功率。孤立敵人未必要攻擊，存活目標下迴避本身並不是錯誤。報告技能機率與變化，而非預先指定唯一正確動作。

### 真實 Replay 背景的單物件干預

`npm run training:diagnose-real-state` 從既有 failure audit 的 nn-0～nn-9，各取到達 5／12／19／26 秒後第一個無硬直、無大招且有可見未受擊／倒地蕉片的決策，共 40 個盤面。先逐決策重現原軌跡，確認重新編碼的全部 features 完全一致、原 greedy 選擇也一致，再做靜態干預。

最近可用蕉片的距離改成 0.5／1.5 倍、水平位置改到左右兩側（保留 y，水平距離至少 60）、高度改成 0／64。已在空中且沒有牛奶燃料的盤面另固定高度比較 vz=+190／−190。越界或離開 viewport 的變體不列入配對，明列各分母；不將 grounded 主角憑空改成跳躍。高度干預保留飛行／跳躍旗標與歷史速度，是局部輸入敏感度測試，不承諾每個反事實盤面都能由真實物理到達。

保留其他物件、上一操作、執行中的 option 與其狀態；速度使用原有可見運動歷史，移動物件不會被算成瞬移速度。重新經過正式 viewport 過濾／距離排序／encoder／合法遮罩。完整動作機率按「技能、方向、物件種類與 ID、移動方式」對齊，不能按已重排的 slot 比較。記錄各技能條件下的完整分布，以及延續原 option 後控制器第一步的輸出。新增 `diagnosticOption()` 只回傳深複製，不改正式決策或遊戲狀態。

補充對照：若原決策有指定敵方目標，且不是上述蕉片，同盤面再改該目標。這是條件式的小樣本補查，與預先固定的最近蕉片樣本分開報告。不試跑任何改動後的未來、不產生安全路線標籤、不訓練，也不更改原 Replay。40 個盤面來自 10 場，不能當成 40 個獨立實戰勝率樣本。

### 主目標固定、周邊威脅成對交換的學習探針

`npm run training:diagnose-route-pairs` 從固定 G50 複製到記憶體；加 `-- --fresh` 改用相同 attention 架構與寬度隨機初始化。兩者都不寫回 checkpoint，不更新 dashboard 或正式訓練狀態。

每個 split 有 48 個桌機盤面：八個目標方位 × 兩種幾何配置 × 左側威脅／無威脅／右側威脅。同一組的主目標牛奶瓶位置與玩家狀態固定，僅交換三片地面蕉片的位置。validation 使用不同距離、偏移與時間，沿用相同八個方位；這是幾何外推的小測試，不是未見敵人種類或整局泛化。

示範標籤：無威脅時選 collect_milk；有威脅時，從八個走路方向中用可見物件的短期線性風險與朝瓶子的進度選一個方向。這是明確的啟發式教師，不是最優路線真相或實測生存結果。NN 的輸入仍只有正式 encoder 提供的可見資訊，不包含教師風險分數；執行時不加自動避險或強制改方向。

固定 30 epochs、batch 16，共 90 次更新；三次重複，不以 validation 挑 checkpoint。主要指標是 16 組左右對照「兩邊都選對」的組數，另列威脅組與無威脅取瓶的完整動作正確率，避免靠只學會取瓶拉高平均。原權重與新權重兩種初始化分開報告；這不是 30 代 PPO，也沒有跑 100 代。所有梯度僅來自 train；validation 不參與 loss。共享表徵的更新可能改變 value，這些候選不能當可用的 PPO checkpoint。

### 簡單模型、座標尺度與方向梯度的正對照

`npm run training:diagnose-route-controls` 在相同 48 train／48 validation 上比較四組：原 attention、座標放大 6.25 倍的 attention、緊湊 MLP、同尺度放大的 MLP。全部隨機初始化，寬度 32、Adam learning rate 0.001、batch 16、三個固定 seeds；先各 30 epochs／90 次更新。`-- --extended` 是獨立的固定 300 epochs／900 次更新對照，仍是監督式小資料測試，不是完整遊戲 PPO 的 100 代。

座標處理只將已可見物件的相對 x/y 從 /1250 轉成 /200 的數值尺度，不添加風險、路線、未來位置或教師答案。主角與其餘狀態維持原欄位。此處只用全新模型，避免把新尺度直接套到舊 weights。緊湊 MLP 保留玩家 32 欄、option 10 欄、三個蕉片 slot 的完整 18 欄與一個瓶子 slot 的 4 欄，共 100 欄；其餘欄位在這個孤立任務均為 padding。遇到其他有效物件即拒絕，不能將這個專用正對照當成一般遊戲輸入或正式架構。

另外用 train 的威脅案例計算「固定教師技能為 move」的方向 cross-entropy、正確方向機率、entropy、方向損失反傳的梯度 norm、各模組 RMS，以及平均梯度 norm／單例梯度 norm 平均的比率。這些量測不更新 weights；比率低表示樣本梯度方向會互相抵消，平衡分類本來也可能如此，不能單憑它宣稱 bug。不同大小模組的 RMS 不作直接重要性排名。validation 只在固定終點評估，不挑中途較好權重。

### 座標尺度契約與實戰轉移

`npm run training:evaluate-coordinate-transfer` 將 raw 與 xy200 各三個 fresh attention 模型，以相同路線示範訓練固定 300 epochs，再於四個新 seeds × 桌機／手機尺寸評估，另帶原 G50 參考，共 56 場。此命令是小型監督式路線訓練加整局評估，不是 PPO 訓練。結果、具 `coordinateContract` 的診斷模型和標準操作 Replay 都寫到忽略的 `.training/diagnostics/coordinate-transfer-*`，不改正式模型或 dashboard。

`sim/coordinate-experiment.cjs` 統一 train／validation／inference 的相對 x/y 轉換；raw 契約不變，新契約 `milk-skills-v5-xy200-v1` 乘 6.25，不額外裁切。每個模型重載後核對動作；每份 Replay 重播核對最終 digest；結果記錄各尺寸的座標範圍與來源模型 hash。手機尺寸僅 headless 模擬。結果必須按交叉模型／遊戲 seeds 解讀，不將所有重複場次當獨立樣本，也不將小型幾何正確率視為生存勝率。

### 真實盤面示範的座標尺度對照

`npm run training:diagnose-natural-coordinate` 使用僅讀正式可見 features／合法遮罩的 `visible-baseline` 教師，從六個固定新 seeds 收集完整遊戲示範，以另外兩個 seeds 作 validation；不依成功與否刪除場次。另四個全新 seeds 作整局測試，與收集資料完全分開。資料保存於忽略的診斷目錄，記錄可見子彈、飛射蕉片、近距離群聚與空曠盤面的覆蓋數；分類可能重疊，不是互斥比例。

六個 fresh attention 模型（raw／xy200 × 三個初始化 seeds）各訓練固定 40 epochs、batch 32、learning rate 0.001，只使用 train。兩種尺度共用資料、初始 weights 與 shuffle seeds。validation 只在最後評估，另列各種盤面的指標，不挑最佳 epoch。這是完整可見策略的 behavioral cloning，小型實驗不擬合 critic、不更新 PPO checkpoint。每臂更新數相同，但不同於上一輪 48 筆合成題的 900 次更新，不能將兩輪的差異全部歸因於資料覆蓋。

測試六個模型及教師，共 28 場桌機 headless 遊戲；Replay 全部重播核對 digest。教師有以可見位置／速度作線性風險估計的啟發式，並非最優策略；NN 不接收教師風險或答案作輸入。原 G50 只作 hash 保護，不覆寫、不微調。本輪不含手機泛化或 100 代 PPO。

### 凍結模型的獨立場景確認

`npm run training:evaluate-natural-coordinate -- PRIOR_DIRECTORY` 載入上一輪六個診斷 checkpoint，嚴格核對 schema、遊戲 digest、座標契約、架構與有限權重。預先固定另外 16 個遊戲 seeds，確認與原 train／validation／test 不重疊。每個 seed 執行六個模型與可見教師，共 112 場桌機 headless 評估；無梯度更新或模型挑選。

保存並核對六個模型共 96 份 Replay，教師僅保存統計，單一實驗不超過 100 份 Replay。開始及結束核對六個 checkpoint 的 SHA-256。配對差分為同訓練 seed、同遊戲 seed 的 xy200 減 raw，以既有 crossed bootstrap 同時重抽模型與場景，不能將 48 場／臂當作獨立場景。三個模型重複仍很少，信賴區間僅是這批實驗的不確定性估計。獨立確認不與原四個場景合併後挑選較好結論，也不啟動 PPO 或更改正式模型。

### 學生軌跡的教師分歧診斷

`npm run training:diagnose-student-trajectories -- HOLDOUT_DIRECTORY` 固定取 holdout 報告前四個場景，重跑六個凍結模型，共 24 場。每次決策只以當下原始可見 features 與學生上一方向詢問教師，不執行教師動作、不預演未來。記錄學生／教師選擇、該決策區間的損血、當下與前兩個動作，最後核對原 Replay 的 final digest，確保診斷沒有改變軌跡。

粗略覆蓋分類為主角起落狀態、低 HP、有無燃料、可見子彈／飛射、近距離群聚／威脅。train 同分類 ≤5 筆稱 sparse。分類只用在報告，不傳給 NN；它忽略精確位置、速度與排列，因此 covered 不代表盤面已被充分學過，sparse 也不代表必然危險。受傷是觀察到的結果，不證明當前動作為唯一原因，教師建議沒有經過反事實驗證。不同決策長度以暴露秒數另外統計。

### 噴射技能損失權重的單變量對照

`npm run training:diagnose-jet-weight -- NATURAL_DIRECTORY` 固定原始座標尺度、既有 1,154 筆 train／376 筆 validation、三組初始化與 shuffle seeds、40 epochs／batch 32。對照組直接載入同一實驗已完成的三個 raw checkpoint；實驗組從相同隨機初始化重訓，只把教師標籤為 jet 時的技能 head cross-entropy 權重由 1 改為 3，方向／目標／移動方式 head 仍為 1，不做額外資料增補或權重調整。沒有調 threshold、挑 epoch 或重新擬合 value。

先記錄同一 validation 上 jet 的召回率、非 jet 的誤選率，以及合法可噴射但教師不選時的誤選率。validation 只有八筆 jet，須報分母，不能單憑比率判定泛化。另固定八個新 seeds，六模型加教師共 56 場；48 份模型 Replay 重播核對。學生自行產生的盤面也詢問教師，但只作記錄，既不改動作也不訓練；不同模型會走到不同盤面，該指標不能當作同盤面配對比較。存活差分用相同初始化／場景作 crossed bootstrap。保存資料集及來源模型 hash，未更新正式模型或 PPO。

### 補學生盤面的噴射正負示範

`npm run training:diagnose-jet-demo -- NATURAL_DIRECTORY` 以三個凍結 raw 模型收集學生軌跡，兩個新遊戲 seeds 作 train、另外兩個作 validation；相同遊戲 seed 的所有模型軌跡都留在同一 split。只保留 jet 合法可用時的當下可見 features，詢問教師當下建議，保留自然比例的 jet／非 jet 標籤，不按後續受傷或生存結果選樣。

從同一舊模型起點，各做 200 次 batch 32、Adam learning rate 0.001 的短微調，兩臂都重設 optimizer。control 每批全部原 train；mixed 每批 16 筆原 train、16 筆學生 train，均有放回隨機抽樣，不作正例加權，所有 CE 權重為 1，原始座標尺度不變。這個 treatment 同時是新盤面示範與其取樣比例的組合，不能單獨歸因於純資料數量；也不是將上輪 ×3 模型再訓練。

固定終點後，對同一學生 validation 量測 jet 召回與合法非 jet 誤選率，也檢查原 validation 的能力是否退步。最後用四個全新 seeds 評估六模型，共 24 場，Replay 全部核對。所有新資料與模型僅保存於忽略的診斷目錄，不改正式 PPO，仍不啟動 100 代。

### 學生示範候選的凍結獨立驗證

`npm run training:evaluate-jet-demo -- JET_DEMO_DIRECTORY` 載入上一輪 control／mixed 各三個固定模型，不更新 weights。用另外四個場景 seeds，讓三個原始 raw 模型收集 jet 合法時的可見盤面與教師標籤，所有六個候選都回答完全相同的盤面，另按遊戲 seed 報告召回／誤選，避免將不同策略造成的盤面差異誤當分類改善。

實戰另用 16 個全新 seeds，各跑六個候選，共 96 場，全部保存並重播核對 Replay，未超過單輪 100 份。盤面驗證與實戰 seeds 不重疊，也不與前輪 train／validation／test 重疊。以 crossed bootstrap 分析相同初始化與場景的生存差分，不混入原四個試驗場景。所有九個來源模型（六候選、三收集者）皆核對開始／結束 SHA-256。報告與盤面檔留在忽略的診斷目錄，不更新正式訓練 dashboard，不跑 PPO。

### 噴射機率排序與技能競爭

`npm run training:diagnose-jet-ranking -- HOLDOUT_DIRECTORY` 讀取凍結 jet-demo holdout 的相同盤面及六個 checkpoint，輸出合法技能遮罩下的 jet 機率、相對最大其他技能的 margin、ROC AUC、以同分組處理的 average precision、完整 precision／recall 曲線與分箱統計，另按四個遊戲 seeds 分開報告。來源資料與模型皆核對 hash，不執行遊戲、不訓練、不選擇部署閾值。

PR 曲線中的門檻只作事後描述，不是已經獨立驗證的策略。policy 機率代表對教師動作的偏好，並非存活機率；未選 jet 時最大的競爭技能也不等於已證明的失敗原因。AUC 衡量正負例排序，AP 的參考是當批正例比例。所有逐步盤面相關，不能以每筆為獨立樣本估計精確顯著性。

### 固定噴射盤面的漏判與誤判案例

`npm run training:diagnose-jet-cases -- HOLDOUT_DIRECTORY` 對同一 holdout 的三個 mixed 模型記錄機率與選擇，將教師 jet 分成三模型全漏／至少一模型選中，非 jet 分成至少一模型誤選／全拒絕。比較可見高度／起落、HP、無敵、燃料、近距離威脅、飛射／子彈、最近五個威脅的位置速度，保留完整索引與來源場景。挑最低分漏判及最高分誤判供案例閱讀；它們不是隨機代表樣本。

教師動作的線性風險估計只作報告，沒有輸入 NN，不能當作引擎碰撞真相，也不能用不同動作下的估計均值直接解釋因果。無敵與低 HP、位置、敵人分布可能共同變動，觀察分組的相關性不足以證明 NN 使用捷徑。若做控制變因測試，需另標記人工修改的觀察值及其分布外限制。

### 無敵與受傷閃爍輸入的控制變因探針

`npm run training:diagnose-inv-sensitivity -- HOLDOUT_DIRECTORY` 固定既有 1,093 筆盤面和三個 mixed 模型，分別只改 inv 欄位、只改 damageInv 欄位、同步改兩欄，測 0／0.3／1／2 秒。其他幾何、速度、HP、歷史與合法動作遮罩保持不變，輸入轉換不修改來源陣列。教師亦作對照，但每個變體統一使用 previousDirection=0，並非還原歷史收集者方向；只改 damageInv 不影響目前教師讀取的 inv，教師建議保持原值。

這是人工觀察介入，不是引擎狀態模擬。單欄變體可能不一致，同步變體也不保證實際可達；不能拿來證明實戰因果、估計勝率或直接當新訓練標籤。報告保留每筆機率及每個來源遊戲 seed 的差分，區分平均、典型與有反應盤面的比例。不因探針結果刪除玩家可見資訊或調整線上閾值。

### 教師噴射評分審核

`npm run training:diagnose-teacher-jet -- HOLDOUT_DIRECTORY` 在固定可見盤面上，使用同一教師程式與受限合法候選集合，取得完整選擇、最佳 move、最佳 jet，以及 jet 同方向 move 的風險／分數。教師 previousDirection 統一為 0；另作 inv／damageInv 同步 0、1、2 秒的人工觀察探針，不預演遊戲。

逐筆核對同方向 move／jet 的估計風險相同，分數差完全等於舊教師 `risk > 1 ? +1 : -0.4` 的獎勵。`tests/teacher-jet-audit.test.cjs` 用單一靜止敵人、僅允許原地 move／jet 的人工案例，驗證距離跨越約 49.238 的門檻時，0.02 單位差可使分數跳變約 1.4 並翻轉選擇。它是評分不連續的正確性測試，不是實戰反事實結果。報告中的「比 move 危險」僅指教師自身啟發式估計，不能宣稱 jet 真實效果較差。

### 獨立教師候選：估計 jet 升空避傷收益

`npm run training:evaluate-jet-teacher` 比較原教師與 `sim/jet-teacher-candidate.cjs`，不修改原教師。候選保留非 jet 候選的評分；jet 從同方向 move 的分數起算，加上「不噴／噴射的預估碰撞傷害風險差」，扣燃料成本。位置、敵人速度只用可見輸入，自己升空用公開動作參數的解析近似，不呼叫引擎未來模擬。0.3 秒動作、0.6 秒風險窗口，燃料限制動力時間，之後估計彈道落下；未把噴射視為立即無敵。只比較碰撞風險差，不把無敵期間仍存在的近距離軟風險當作耗油收益。

這不是精確物理模型：高於懸浮高度時採簡化減速近似，未知敵人行為仍用線性運動，未考慮噴射殺敵收益與所有未來事件。原風險估計仍有碰撞／高度門檻；只移除 risk>1 的額外跳分，不能宣稱所有評分完全連續。

測試先固定人工案例（無威脅、可及時升空、近到升空仍受威脅、短燃料、長無敵、舊門檻兩側），再跑既有 validation fixture 的 jet／evade／flight 各八個場景，最後 16 個新 seeds × 兩策略共 32 場真實物理實戰，全部 Replay 核對。無 NN 訓練、不替換示範來源。成本預設固定為 0.2×動力時間/0.3 加 0.1×使用燃料比例，未依實戰結果調參。
