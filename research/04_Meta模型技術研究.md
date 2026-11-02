# Meta 模型技術研究：異地散步導遊

研究日期：2026-10-31。方法：只讀官方文件（dev.meta.ai/docs 用 WebFetch 取得，Cerebral Valley 參賽指南用 Chrome 讀取）。未執行任何程式、未呼叫任何 API。
標記說明：未標記者為文件明載；「推論」為研究者推測；「未載明」表示文件沒寫。WebFetch 內容是小模型摘要，關鍵數字建議實測或回頭核對原文。

---

## 00. 原文查證記錄（2026-10-31，Chrome get_page_text 讀原頁，非 WebFetch 摘要）

標記：**[原文已核對]** = 已用 Chrome 讀原頁逐項確認；未標記的其他章節仍來自 WebFetch 摘要。

**A. 台灣能否使用 [原文已核對]**
來源：https://dev.meta.ai/legal/geographic-use-policy（Last updated: October 12, 2026；從 /docs/models 的 "Geographic Use Policy" 連結取得）。
- **台灣不在任何限制清單中。** 第 3 節 Restricted Territories 共 21 項：阿富汗、白俄羅斯、柬埔寨、中華人民共和國（含港澳）、古巴、厄利垂亞、衣索比亞、海地、伊朗、伊拉克、利比亞、緬甸、尼加拉瓜、北韓、巴基斯坦、俄羅斯、索馬利亞、敘利亞、烏克蘭克里米亞/頓內茨克/盧甘斯克、委內瑞拉、西撒哈拉。台灣未列入（PRC 條目只寫 PRC 含港澳）。
- 第 2.2 節 Model-Specific 限制只有一條：**Muse Image：印度**。Muse Spark、Voice Transcribe、SAM 3.1 **沒有任何國家別限制**；因此在文件上，這三者在台灣沒有被禁。
- /docs/models 另寫：**Muse Wonder 與 Wonder Full 目前在南韓不可用**（此條不在 Policy 頁，只在 models 頁）。
- **「API preview 僅限美國開發者」的說法：文件中查無此限制，可排除為文件事實。** Policy 沒有任何「僅美國」字樣；Muse Wonder 雖標 preview，但限制只提到南韓。
- 但有一個保留：Policy 2.1 寫明 Meta 是「在 Meta 已啟用存取的司法管轄區」才可用，並以技術手段控制，且可隨時變更；「未被列入禁止」不等於「保證已啟用」。**最終要以註冊帳號與實際 API 呼叫（如 `GET /v1/models`）確認。** 另外，信用卡與帳單地區可能影響註冊，文件未載明（實測）。
- 隱私面：Standard Models 含 Muse Image、Spark 1.1/1.2/1.3、Voice Transcribe、SAM 3.1、Wonder；Contributor Models 僅 Spark 1.2/1.3 Contributor。

**B. 價格與限制 [原文已核對]**（/docs/pricing-rate-limits）
- Muse Spark 1.3（Standard）：快取輸入 $0.15、輸入 $1.25、輸出 $4.25（每 1M tokens）。與先前一致。無長 context 加價。Contributor：$0.002 / $0.10 / $0.20。
- 速率：`muse-spark-1.3` 3,000 RPM、4,000,000 TPM；Contributor 150 RPM、3,000,000 TPM；速率是每 team、不是每 key。回應帶 `x-ratelimit-*` 標頭（Voice Transcribe 不帶）。
- Meta 注入的系統提示與腳手架 token **不計費**。
- Web search grounding：**$2.50 / 1,000 次搜尋查詢，另計 token 費**，適用於 Wonder 與 Spark 的 `web_search` 工具。已核對。
- SAM 3.1：圖片 $2.50/1,000 張；影片 $0.20/1,000 幀（每請求最少 50 幀）。Voice Transcribe $0.18/小時、秒計費無條件捨去。Muse Image $0.01/張。全部已核對。

**C. Search grounding 引用格式 [原文已核對]**（/docs/search-grounding）
- 工具：Responses API `tools=[{"type":"web_search"}]`。`output` 含 `web_search_call` 與 `message`；`output_text` 的 `annotations[]` 為 `type: "url_citation"`，欄位 `url`、`title`、`start_index`、`end_index`（對 `text` 的字元位移）。已核對。
- `include: ["web_search_call.results"]` 回傳每個搜尋的 `results[]`：`type: text_result`、`title`、`url`、`snippet`；文件明說「results 是模型考慮過的全部來源，citations 是實際引用的子集」。已核對。
- 參數：`search_context_size` low/medium/high；`user_location`（type 只能 approximate，country 兩碼、region、city、timezone，全選填）。**沒有 domain / 語言限制參數**；Messages API 的 `allowed_domains`、`blocked_domains`、`max_uses` 回 400。已核對。
- 僅 Responses 與 Messages；Chat Completions 不支援。可與自訂 function tools 並用，但自訂函式名不能是 `browser.search`、`browser.open`、`browser.find`。模型自己決定是否搜尋；文件自承「來源選擇與品質仍在改善、覆蓋不完整、多跳研究較不可靠」。已核對。
- 該頁的 Next steps 提到「Pair citations with structured output」，但頁內**沒有**搭配範例（維持待實測）。

**D. SAM 3.1 一次只能一個文字概念 [原文已核對]**（/docs/sam/segmenting）
- 原文：「One concept per request: there is no multi-concept syntax. Comma, semicolon, and plus lists return zero matches; an 'and', a newline, or a second input_text part segments only one of the concepts. To segment several concepts, send one request each.」→ **確認：文字概念一次只能一個。**
- 例外：**框/點提示一次可提示最多 16 個物件**（同一請求）；但文字概念與框點提示不能同時用（400）。
- 其他已核對：指令與疑問句（"segment the bus"）不可靠、常回空；否定與 OR 不一致；空間詞僅部分遵守；可加顏色等屬性縮小（"red square"）；要在應用層用回傳的框座標做位置過濾。**同一請求的結果每次可能略有不同**（框座標、遮罩邊緣、偶爾物件有無）。
- `w`、`h` 必須與媒體長寬比一致，否則 400；需先處理 EXIF 旋轉。
- 影片限制 MP4/MOV（H.264/H.265/MPEG-4）、≤15,000 幀；追蹤 ≤16 物件。**圖片大小/格式上限，該頁仍未載明。**
- 說明：SAM 3.1 自己不回答問題、不推理場景；官方建議以 Muse Spark 先辨識再把概念交給 SAM（與本報告第 4 節建議一致）。

**E. Voice Transcribe 語言清單 [原文已核對]**（/docs/speech-to-text，並對照 /docs/models）
- 25 種語言原文：Arabic, Bengali, Dutch, English, French, German, Hebrew, Hindi, Indonesian, Italian, Japanese, Kannada, Korean, Malay, **Mandarin Chinese**, Marathi, Polish, Portuguese, Spanish, Tagalog, Tamil, Telugu, Thai, Turkish, Vietnamese。
- **沒有 zh-TW / Traditional Chinese / Cantonese 字樣；全頁也未說明輸出是簡體或繁體，也沒有任何 `zh-TW` 之類的語言代碼參數。** `languageBias` 是語言名稱字串陣列（範例 `["English","French"]`）。models 頁稱「25 evaluated languages」。
- 因此：「是否輸出繁體中文」文件**查無**，必須實測；若輸出簡體，需要自己轉繁體（推論）。
- 其他已核對：handshake 為第一個 JSON 文字幀、10 秒內；金鑰放 `authorization.accessToken`（`"Bearer <key>"`），WebSocket 不讀 HTTP Authorization header；範例 handshake 用 `PCM_24KHZ`、`PUSH_TO_TALK`/`ENDPOINTING`、`partialMode: CUMULATIVE`；回 `turn-level timestamps`，無字級時間戳；`keywords` 與 `languageBias` 只能在開始時設定；不提供 TTS。範例是 Python 伺服器端程式，**頁面無任何瀏覽器/CORS/臨時 token 說明**。

---

## 0. 先看這幾個關鍵發現（含時程風險）

1. **截止時間很近**：建置期 10/27–11/4，**11/4（週三）21:00 ET 前要在 CV 平台提交**（台灣時間 11/5 10:00）。今天 10/31，只剩約 4 天。必須附 **3 分鐘 demo 影片**、**公開 repo**。
2. **$150 額度要自己申請**：要填 Google 表單、綁信用卡（會有暫時預授權）、**每人各自在 11/4 21:00 ET 前領取**，分批發放，要去 Billing 頁確認有入帳。可在 Billing 設 Spend Limit 通知。
3. **參賽指南的 Baseten model id 與文件不同**：文件寫 `meta-models/muse-spark-open`，**黑客松指定要用 `meta-models/muse-spark-open-1026`**（與你給的資訊一致）。
4. **Muse Voice Transcribe 的語言清單沒有「繁體中文」**，只有 Mandarin Chinese；日文、英文有。
5. **瀏覽器不能安全直連任何 Meta API**：文件明說金鑰不要放前端、沒有 ephemeral token、沒有 CORS 說明。要走後端代理（含 WebSocket 代理）。
6. **Muse Glimmer 是 30B dense，不是手機等級模型**；ExecuTorch 匯出只支援 CUDA / Apple MLX，**不支援 CPU、文件沒有手機部署**。手機離線模式不可行；筆電離線需 24GB 以上 VRAM 或高記憶體 Apple silicon。
7. **參賽指南的 Anti-Projects 清單**含「Simple Image Analyzers」「Basic RAG Applications」。你的專案有 GPS + 地圖資料 + 代理 + 語音 + 分割，要在 demo 強調這些超出「單純看圖解說」的部分，避免被歸類。
8. 評分權重：Impact 30%、Meta 工具使用 25%、技術深度 20%、Demo 25%。Stage 1 是 pass/fail（要合理使用 Meta 模型並貼合主題）。主題二選一：Build for Your World / Push the Frontier（你的專案較貼近前者）。

---

## 1. 各模型能力表

來源：/docs/models、/docs/pricing-rate-limits、各模型專頁。

| 模型 | model id | 輸入 | 輸出 | 關鍵功能 | 限制 / 注意 | 價格 | 速率限制（每 team） | 延遲 |
|---|---|---|---|---|---|---|---|---|
| Muse Wonder | `muse-wonder-1.0`（preview） | 文字、圖、影片、音訊、PDF | 文字 | 最強、長時程代理與軟體工程；context 1,048,576；reasoning effort `minimal`~`max` | 南韓不可用；無 Contributor 模式；完整版 Muse Wonder Full 只在 Muse Code 高階方案 | Standard：輸入 $4.00 / 快取輸入 $0.20 / 輸出 $20.00（每 1M tokens） | 3,000 RPM；4M TPM | 未載明 |
| Muse Spark 1.3 | `muse-spark-1.3` | 文字、圖、影片、音訊、PDF | 文字 | 工具呼叫、結構化輸出、search grounding、tool search、1M context、reasoning（含 `max`）、prompt caching、圖像座標定位 | **音訊支援不穩，文件建議音訊用 1.2**；單張圖約 1,300–1,500 tokens（約 1280px） | Standard：輸入 $1.25 / 快取 $0.15 / 輸出 $4.25 | 3,000 RPM；4M TPM | 未載明 |
| Muse Spark 1.2 / 1.1 | `muse-spark-1.2`、`muse-spark-1.1` | 同上 | 文字 | 1.1 僅 Standard 模式 | 1.2 音訊較可靠 | 同 1.3 | 同 1.3 | 未載明 |
| Muse Spark Contributor | `muse-spark-1.3-contributor`、`-1.2-contributor` | 同上 | 文字 | 內容可被用於訓練，換較低價 | 隱私：使用者位置與照片會被用於訓練（推論：不建議用於會傳使用者照片的 demo） | 輸入 $0.10 / 快取 $0.002 / 輸出 $0.20 | 150 RPM；3M TPM | 未載明 |
| Muse Image | `muse-image-1.0` | 文字 + 圖片（參考圖） | 圖片 | 生成、編輯、多圖合成、**內建自動網路/圖片搜尋 grounding**（不能傳 `web_search` 工具，會 400）、`reasoning_strength` high/low | 不支援 `mask`、`input_fidelity`、`partial_images`；`size` 只決定比例；比例超過 16:1 回 400；內容政策會擋 | **$0.01 / 張**（失敗或被過濾不計費；內建搜尋不另收） | 150 RPM | 未載明 |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | 音訊（PCM 串流或 WAV 檔） | 文字逐字稿 | 即時串流、檔案轉錄、25 語言 code-switching、keyword biasing、三種模式 | **沒有 TTS**；無字級時間戳、無信心分數；不可用 Contributor 模式 | **$0.18 / 小時音訊**（秒計費、無條件捨去；串流與檔案同價） | 256 並行串流；16,000 串流/小時 | 文件無數字 |
| SAM 3.1 | `sam-3.1` | 圖片或影片 + 文字/框/點提示 | 特殊 token 文字（框 + 遮罩） | 文字概念提示、框/點提示、影片追蹤 | 一次一個概念；圖片大小限制未載明 | 圖片 **$2.50 / 1,000 張**；影片 $0.20 / 1,000 幀（每請求最少 50 幀） | 3,000 RPM | 未載明 |
| Muse Glimmer | HF `meta-models/Muse-Glimmer-30B` | 文字、圖片 | 文字 | 開源權重（Apache 2.0）、30B dense、蒸餾自 Spark、128K context、工具呼叫、推理 | 無音訊/影片輸入；無 Meta 託管的 web_search（推論：搜尋要自己做成 tool） | 自架免費；Together AI 託管 $0.35 輸入 / $0.04 快取 / $1.50 輸出 | 依供應商 | 未載明 |
| Muse Spark Open | Baseten：`meta-models/muse-spark-open-1026`（黑客松指定） | 文字、圖、音訊、影片 | 文字 | 816B MoE / 42B active、1M context、代理與程式 | 模型授權為 Muse Model License + AUP | 文件頁未載明（各供應商自訂） | 依供應商（Baseten 另有申請 $100 與 2M TPM） | 未載明 |

補充：
- 支援端點：Responses（推薦）、Chat Completions、Messages、Files、Images、Voice、Models、Status。**search grounding 與 tool search 只支援 Responses 與 Messages，Chat Completions 不支援。**
- 速率限制是「每 team」不是每把 key。背景請求（`background: true`）每 team 600/分。
- Standard 模式不會用內容訓練；Contributor 模式會。
- 模型各國可用性有差異；Geographic Use Policy 已讀，台灣未被列入限制（見第 00 章 A）。

---

## 2. Search grounding 細節（決定「有出處」怎麼做）

來源：/docs/search-grounding、/docs/protocols。

**如何開啟**
- Responses API 的 `tools` 加入 `{"type": "web_search"}`。Messages API 也可加同樣物件，結果以 `server_tool_use` blocks 回傳。
- 可選參數：
  - `search_context_size`：`low` / `medium` / `high`（越高 context 越多，延遲與 token 越多）
  - `user_location`：`type: "approximate"`、`country`（ISO 兩碼）、`region`、`city`、`timezone`（IANA）
- 要看原始搜尋結果：請求加 `include: ["web_search_call.results"]`。
- **模型自己決定要不要搜**；它有把握的簡單事實可能跳過搜尋。

**回傳出處格式**
- `output` 內有 `web_search_call` 項目（`id`、`type`、`status`）與 `message` 項目。
- `message` 的 `output_text` 區塊帶 `annotations`，類型 `url_citation`，欄位：`url`、`title`、`start_index`、`end_index`（字元位移，對應 `text`）。
- 加了 `include` 後，每個搜尋呼叫有 `results` 陣列（`type: text_result`、`title`、`url`、`snippet`）：這是模型「看過」的全部來源；citations 是「實際引用」的子集。
- 渲染行內引用：用 `text[start_index:end_index]` 對應 title/url。
- 串流：`client.responses.stream()`，先來搜尋事件，再來 `response.output_text.delta`。

**能否限制語言 / 網域**
- **不能**。文件只有 `user_location` 這個偏向性參數。Messages API 的 `allowed_domains`、`blocked_domains`、`max_uses` 直接回 HTTP 400。
- 推論：要限制出處品質，只能在 system prompt 要求「只採用維基百科、政府、官方網站」，並在後端用網域白名單**過濾 citations**，不合格就不講。這正好吻合「不確定就不說」的原則。

**其他**
- 可與自訂 function tools 同一個請求並用，但自訂函式名稱不能是 `browser.search`、`browser.open`、`browser.find`（否則 400）。
- `max_tool_calls` 可限制內建工具（含 web_search）次數，最小 1；不限制 function tool。
- 文件說「可搭配結構化輸出做有出處的 JSON」，但**沒給細節**（實測項目）。
- 品質：文件自述「coverage 仍在改善」，單一事實、近期事件最有效，複雜多跳研究較不可靠，重要答案要查 citations。
- 費用：**$2.50 / 1,000 次搜尋查詢**，另計 token 費。

---

## 3. Muse Voice Transcribe 細節

來源：/docs/speech-to-text、/docs/cookbook/voice-api-fundamentals。

**即時 WebSocket 協定**
- 網址：`wss://api.meta.ai/v1/asr/realtime`，可選 query `sessionId`（沒給則伺服器產生）。
- 連線後 **10 秒內**要送一個 JSON 文字幀（handshake，共 9 個欄位）：`authorization.accessToken`、`audioEncoding`、`model`、`mode`、`partialMode`、`emitAudioProgress`、`languageBias`、`keywords`（另一欄位文件摘要未列出，完整欄位看 API reference）。
- 驗證：`authorization.accessToken` 填 `"Bearer <key>"`。**即時端點忽略 HTTP Authorization header 與 query 的 API key。**
- 伺服器回 `{"sessionId": "..."}`（沒有 `type` 欄位），收到後才能送音訊。
- 音訊：**原始 signed 16-bit little-endian、單聲道 PCM**，以二進位幀傳送，要接近即時速度送。`PCM_24KHZ`（原生，48,000 bytes/s）或 `PCM_16KHZ`（32,000 bytes/s，伺服器重採樣）。無容器、無時間戳、無結尾標記。
- 結束：送完排隊音訊後送 `{"type": "endStream"}`，之後不再送，持續讀到伺服器以 code `1000` 關閉。
- 事件：`speechStart`、`transcript`、`speaker`（僅 diarization）、`speechEnd`、`speechComplete`、`audioProgress`、`error`。partial 預設為累積式（取代前一個，不要 append）；以 `turnId` 管理狀態，`speechComplete` 可能亂序；未知事件要忽略。
- 三種模式：`PUSH_TO_TALK`（預設，由你標示輪次邊界，完成為 `transcript` 且 `final: true`）、`ENDPOINTING`（模型偵測輪次邊界，完成為 `speechComplete`；cookbook 的麥克風預設即此）、`DIARIZATION`（加講者標籤，**不適合低延遲語音指令**）。模式握手後不可改。
- 限制：單一 session 預設最長 60 分鐘（無 resume token）；送音訊不可超前處理進度 5 秒；活源靜音時要送 PCM 靜音；close code 1008（握手逾時／積壓／低於即時）、1011（超過 60 分鐘）、1013（被限流）。
- 檔案端點 `POST /v1/asr/transcribe`：multipart，`request` JSON + `audio` WAV（mono、16-bit PCM、16k 或 24k）；最長 10 分鐘、32 MB；Accept 可為 json / event-stream / text/plain。

**瀏覽器能否直連**
- 文件沒說可以，也沒有 ephemeral token。金鑰放在 handshake JSON 裡，若瀏覽器直連就等於暴露金鑰。
- 推論：建議後端做 WebSocket 代理——瀏覽器用 `MediaRecorder`/`AudioWorklet` 取得 PCM 傳給你的後端，後端持金鑰連 Meta。或者用「按住說話 → 錄一段 → 傳後端 → 用 `POST /transcribe`」降低複雜度（但要轉成 WAV，單檔 ≤10 分鐘，很夠）。瀏覽器 WebSocket 本身能送 JSON 幀，所以技術上可直連，只是金鑰安全不允許。
- 瀏覽器麥克風需 16/24kHz 單聲道 PCM16：通常要用 AudioWorklet 重採樣（推論）。

**Keyword biasing**
- `keywords`：字串陣列（產品名、人名、地名、縮寫），例如 `["Acme Mobile", "eSIM", "5G"]`；只做偏向，不保證拼字。
- `languageBias`：預期語言陣列，如 `["English", "French"]`；只偏向，不強制；省略則自動偵測。
- 兩者都要在 session 開始時設定，**不能中途更換**。
- 推論：可預先放「人孔蓋、電線桿、超商、7-ELEVEN、全家、マンホール、コンビニ」以及目前 GPS 附近的 OSM 地名；但因為不能中途變更，每次移動到新地區要重開 session，或放較廣泛的詞表。

**支援語言（25）**：Arabic、Bengali、Dutch、English、French、German、Hebrew、Hindi、Indonesian、Italian、**Japanese**、Kannada、Korean、Malay、**Mandarin Chinese**、Marathi、Polish、Portuguese、Spanish、Tagalog、Tamil、Telugu、Thai、Turkish、Vietnamese。
- **繁體中文沒有單獨列出**。輸出會是簡體還是繁體、台灣用語辨識度如何，文件沒寫（需實測；推論：可在後端用 OpenCC 之類轉繁體，但這屬於寫程式，現階段僅記錄）。
- 中英日夾雜（code-switching）有宣稱支援。

**延遲**：文件無數字。價格 $0.18/小時；ZDR（零資料保留）與 Standard 同價。

**補充（替代方案）**：Spark 與 Wonder 可直接收音訊輸入，但 **Spark 1.3 音訊不穩，建議用 1.2**。可作為備援或做「語音理解（不只轉文字）」，但推論：作為主要語音入口仍建議用 Voice Transcribe。

**TTS**：Meta 沒有 TTS。Ray-Ban cookbook 的做法是用裝置端 `AVSpeechSynthesizer`。推論：網頁版用瀏覽器 Web Speech API（`speechSynthesis`），多語言口音品質依裝置而定。這點對「由 AI 主動用語音講」很關鍵，要提前實測 iOS Safari 與 Android Chrome（尤其是 iOS 背景播放與需要使用者手勢啟動音訊的限制）。

---

## 4. SAM 3.1 細節

來源：/docs/media-segmentation、/docs/sam/*、cookbook sam-api-basics。

**請求**
- `POST https://api.meta.ai/v1/responses`，`model: "sam-3.1"`，`input` 為一則 user message，內含 `input_text`（短名詞片語，如 "manhole cover"）與 `input_image`（`image_url` 可為公開 URL 或 base64 data URL）。建議 `stream: true`，非串流也可。
- 可選 `metadata`：`include_confidence: "true"`（框與遮罩加信心值 `c` 0–1）、`mask_encoding: "lossless"（預設）| "one_bit"`（較小；框/點提示一律 one_bit）、`propagation_direction`（影片）。
- **座標須使用圖片顯示像素尺寸（`w`、`h`）**。

**回應**
- 特殊 token 文字，在 `output_text`。每個畫面一行，以 `<Nf>` 開頭，後接逗號分隔記錄：整數 object id + 一個 box token + 一個 mask token。
- 框：`<|box;x1;y1;x2;y2;w;h|>`（原圖像素左上右下）。
- 遮罩：`<|mask;x=0;y=0;data=H,W,<enc>payload|>`，H、W 是遮罩光柵大小（**比原圖小**），`<enc>` 為 `~`（lossless）或 `!`（one_bit），payload 是 **base85**。官方客戶端庫解碼：`@meta-sam/parser`（TypeScript，ESM only，Node ≥20.17）、`meta_sam_parser`（Python ≥3.10）。`decodeMaskToRaster` 得 0/1 的 row-major Uint8Array；亦可轉 COCO RLE 或 SVG 路徑。`@meta-sam/graphics` 可在 Canvas 2D 畫遮罩與框（預設填色 0.35、描邊 0.8）。
- 0 個命中是有效結果（空 output_text，不是錯誤）。

**多提示**：**文字概念一次只能一個，一個請求一個概念**（逗號、and 不會分割）。要找多種物件就送多個請求（可並行，3,000 RPM）。框/點提示可一次最多 16 個物件。
**圖片限制**：**文件未載明大小/解析度限制**。
**價格**：圖片 $2.50/1,000 張（約 $0.0025/次）。

**街景小物件「圈出」的可行性（推論）**
- 做法 A：Spark 看圖辨識（可輸出 0–1000 正規化的 point/box/count，文件有說明並建議搭配結構化輸出），再用 SAM 框提示精修遮罩。文件的 Media segmentation 頁也建議「Spark 解讀場景，SAM 3.1 產生遮罩」的組合。這是最穩的組合，也是「超越基本串接」的好賣點。
- 做法 B：直接丟 SAM 名詞片語（"utility pole"、"manhole cover"、"vending machine"）。文件建議簡短具體名詞，指令、疑問、列表、否定、空間詞不可靠。人孔蓋、電線桿這種日常物件理論上是常見概念，**但實際辨識率沒有文件數據，要實測**。
- 由 Spark 先判斷「這張照片有哪些名詞」再逐一送 SAM（每個一次請求），可行且便宜。

**模糊人臉的可行性（推論）**
- 文件的用例清單明列「遮罩一個物件以移除、模糊或替換」與「影片中的遮蔽/redaction」，所以原理被認可。
- 可以送 "face" 或 "person's face"；或送 "person" 取得全身遮罩後整人模糊（較保險，召回率較高，尤其側臉、遠處、戴帽子或口罩）。
- 風險：背對、遠處小臉、安全帽、車內人物（玻璃反光）可能漏；**漏臉就是隱私事故**，Demo 要讓 UI 明確顯示「已模糊 N 人」。建議流程：先模糊（SAM 對 "person" + "face" 取聯集）再把**已模糊的圖**送給 Spark，且遮罩運算在你的後端或前端完成。
- 注意：**照片要先送到 Meta 的 SAM 才能得到遮罩**，所以「原圖」本身仍會傳到 Meta API。如果要強調隱私，需在文案上準確表述：Standard 模式不拿來訓練，但原圖仍會經過 API；若要做到「原圖不離開裝置」，推論需要在裝置端用其他本地模型做偵測，但這就不是 Meta 模型了（或以 Glimmer 本地跑不出遮罩，因為 Glimmer 輸出文字，只能給座標框）。
- Standard 與 Contributor：照片相關呼叫務必用 Standard。

---

## 5. Muse Glimmer / Spark Open 與離線 / Bonus 評估

來源：/docs/muse-glimmer(+hardware-platforms, quantization, deploy, get-the-model)、/docs/muse-spark-open(+deploy)、/docs/open-weight-models、cookbook glimmer-api-agent、參賽指南。

**Muse Glimmer**
- 單一型號、**30B dense** decoder-only、含視覺編碼器、蒸餾自 Spark；文字+圖片輸入、文字輸出；128K context；100+ 語言訓練；Apache 2.0；會逐步推理。
- 檔案：bf16 約 60 GB（`meta-models/Muse-Glimmer-30B`，文件頁另有「約 80 GB 磁碟」的描述，兩者不一致，以 HF 頁為準，實測確認）。GGUF（`meta-models/Muse-Glimmer-30B-GGUF`）：Q4_K_M 16.8 GB、Q4_K_XL 19.7 GB、視覺投影 1.4 GB、DFlash 草稿模型 1.6 GB（選用）。
- 記憶體預算（Q4_K_M + 視覺 + 131K context）：約 19.0 GiB，「適合 24 GiB 顯卡」；XL 版適合 32 GB VRAM。vLLM bf16 需約 72 GB VRAM。文件列的伺服器平台：2× Intel Arc Pro B70（各 32GB）、Xeon 6 + 512GB DDR5、1× NVIDIA B300。
- 執行環境：vLLM、SGLang（NVIDIA 或 Apple silicon）、llama.cpp（b10353+，CPU/GPU/Metal 混合）、Ollama（0.32.7+，`ollama run muse-glimmer`，Apple silicon 有 `muse-glimmer:30b-mlx`）、LM Studio、Unsloth、Transformers、OpenVINO。
- **ExecuTorch**：只有 CUDA 與 Apple MLX 後端匯出，**不支援 CPU**；預建 `.pte` 共 16 個，單一匯出約 18–31 GB；限制為無影片輸入、一次一個請求、無跨 session 前綴共享。**手機部署文件未載明（deploy 頁寫「不涵蓋行動裝置」）。**
- 託管：Together AI（`meta-models/Muse-Glimmer-30B`，$0.35/$1.50 每 1M）。
- 工具呼叫：各 runtime 都支援（SGLang `--tool-call-parser muse`、vLLM `muse_glimmer`、ExecuTorch `--tool-parser atem`；ExecuTorch 不支援 `reasoning_effort` 與 `tool_choice=required`）。
- 官方有範例 cookbook「Local agent that asks first」：Glimmer 在本機跑 agent loop，需要更強能力時透過「出站審核閘門」才呼叫 Muse Spark。這個設計非常貼合你的「隱私」敘事。

**Muse Spark Open**
- 816B MoE / 42B active、1M context、輸入含文字/圖/音訊/影片。
- BF16 約 1.65 TB（8× B300 級）；NVFP4 約 537 GB（單台 4 GPU Blackwell 節點）。Mac 上可用 2～4 台 Mac Studio（cookbook 有，我沒讀細節）。**不可能在你的筆電跑**，只能走託管。
- 託管供應商：Together（`meta-models/muse-spark-open`）、Fireworks（`accounts/fireworks/models/muse-spark-open`）、Baseten（文件寫 `meta-models/muse-spark-open`，**黑客松改用 `-1026`**）、Groq（需組織核准）、Nebius；另有 Modal、OpenRouter。
- 贊助商資源：Baseten 申請 $100 + 2M TPM（至多 2,000 人，審核，個人制）；Modal $100（前 1,000 人）；Fireworks $100（精選團隊）。

**離線模式可行性（推論）**
- 手機純離線：**不可行**（無手機部署文件、30B 太大）。
- 「筆電離線 demo」：可行，但需 ≥24GB VRAM 的 GPU，或大記憶體 Mac（Ollama MLX / llama.cpp Metal）。**但離線就沒有 search grounding（web_search 是 Meta API 的伺服器端工具）、也沒有 SAM 與 Voice Transcribe**，所以只能做「已預先快取的內容 + OSM 資料」的降級導遊。成本高、4 天內不建議作為主線。
- 折衷：把 **Glimmer 當成「便宜/隱私優先」的第一線導遊**（吃預先查證過的事實卡 + 附近 OSM 資料，在 Together 託管或本機），不確定時再升級到 Spark + search grounding；呼應官方「asks first」模式。

**Best Build on Meta Open Weight Models（$10K）可行性**
- 條件：使用 Glimmer 或 Spark Open，自己的硬體或合作夥伴推論；第一輪評審時由基礎設施夥伴驗證專案確實跑在合格開源模型上。
- 推論：最低成本拿此獎資格的做法，是讓導遊的主要敘述生成（或代理主迴圈）真的由 Glimmer（Together 託管，便宜）或 Spark Open（Baseten `-1026`）處理，API 版 Spark 只負責「查證」。需注意：開源模型沒有內建 search grounding，需把查證做成你自己的 tool（例如先 Wikipedia/Wikidata 查詢再餵給模型），或讓代理在需要時呼叫 Spark 的 web_search（作為子代理）。這會增加架構複雜度；4 天時程下，建議視進度決定，預設做成可切換的「模型後端開關」，演示時展示同一功能在開源模型上的運作。
- 注意：同時主打 Best Creative Build（Muse Image/Wonder）與 Open Weight Bonus 並不衝突，獎項可疊加，但每個都要在 demo 影片中明確呈現。

---

## 6. Muse Image：路邊圖鑑卡的可行性與成本

來源：/docs/image-generation、定價頁。

- 端點：`POST /v1/images/generations`（單次）、`/v1/images/edits`（編輯/合成，1–10 張參考圖）、Responses API（多輪、`image_generation` 工具）。
- 價格 **$0.01/張**（失敗或被過濾不計費；內建搜尋不另收）。`reasoning_strength: low` 較快、價格相同；`high`（預設）多輪精修較慢。**延遲文件未載明**。
- 參考圖：可把使用者剛拍的（已模糊人臉的）照片當參考圖做「風格化圖鑑卡」。內建自動 web/image 搜尋可讓圖有現實依據（真實地點、產品、Logo、風格），也可做資訊圖表式排版。
- 限制：沒有文字渲染專用參數；卡片上的中文字品質**需實測**（推論：建議文字用前端 HTML/CSS 疊加，只用 Muse Image 產生插圖/底圖）。比例超過 16:1 失敗；150 RPM。輸出預設 base64 webp；`background` 永遠 opaque。`moderation` 參數會 400。
- 成本：每次散步 3–10 張卡約 $0.03–$0.10，可忽略。
- 參賽價值：直接對應 **Best Creative Build（$5K）**（Muse Image 或 Wonder）。可以設計「收集圖鑑」的遊戲化機制（推論：拍照 → SAM 圈出 → 生成日台比較圖鑑卡 → 存入收藏）。
- 風險：圖鑑卡中的事實需有出處（卡片文字來自查證過的 grounding，而不是生圖模型自己編）。

---

## 7. 建議架構（推論，依文件能力對應）

### 7.1 功能 → 模型 / 端點

| 功能 | 模型 | 端點 | 備註 |
|---|---|---|---|
| 導遊代理主迴圈（決定講什麼、挑跟家鄉不同的、做比較） | `muse-spark-1.3`（推理 effort 調低以降延遲）；主迴圈如需更強可試 `muse-wonder-1.0`（貴 3.2×輸入、4.7×輸出） | `POST /v1/responses`（推薦；推理跨輪保留、可用 `previous_response_id`） | 工具必須 `tool_choice: auto`，不能強制；要處理「純文字回應」與「工具呼叫」兩種結果 |
| 查證與出處 | 同上，內建 `web_search` | Responses（與自訂工具同請求可用） | 後端過濾 citations 網域；沒有可信 citation 就不講 |
| 附近地圖資料 | 自訂 tool（Overpass API / OSM） | 你的後端 | 回傳精簡結構化清單（類型、距離、方位、名稱） |
| 看照片、圈物件 | Spark 看圖（0–1000 座標）→ SAM 3.1 精修遮罩 | Responses（Spark）+ Responses（sam-3.1） | 兩階段；先模糊人臉 |
| 模糊人臉 | SAM 3.1（"person" / "face"，一概念一請求） | Responses | 後端用 `@meta-sam/parser` 解碼遮罩，再套模糊 |
| 語音提問（中英日夾雜） | `muse-voice-transcribe-1.0`（ENDPOINTING 模式） | WS `/v1/asr/realtime` 經後端代理，或 `POST /v1/asr/transcribe` | 用 `languageBias: ["Mandarin Chinese","Japanese","English"]`、`keywords` 放 OSM 地名 |
| 說出聲音（TTS） | **無 Meta 模型** | 瀏覽器 Web Speech API（推論） | 實測 iOS / Android |
| 圖鑑卡 | `muse-image-1.0` | `/v1/images/generations` 或 edits | 文字用前端疊加 |
| 記憶已講過的 | 自己的資料庫（SQLite/KV）+ tool | — | 見下 |
| 開源獎項 | Glimmer（Together）或 Spark Open（Baseten `-1026`） | Chat Completions（自訂工具；開源模型不一定有 Responses） | 模型後端可切換 |

### 7.2 導遊代理設計

- **迴圈（Responses API）**：每次 GPS 更新或到固定間隔（2–3 分鐘或移動超過 N 公尺）觸發；也可由使用者語音提問或拍照觸發。用 `previous_response_id` 串接，保留推理。
- **Tools（function calling）**：
  1. `get_nearby_places(lat, lon, radius, kinds)`：查 OSM。
  2. `get_user_context()`：使用者家鄉、語言偏好、目前速度/停留。
  3. `recall_told(topic_ids)` / `mark_told(topic_id, summary)`：查詢與寫入「已講過的」記憶（避免重複）。
  4. `verify_fact(claim)`：內部可呼叫內建 `web_search`，或自訂檢索；回傳含 url 的證據；無證據則回「unverified」。
  5. `analyze_photo(image_id)`：先模糊人臉 → Spark 看圖給候選物件 → SAM 圈出。
  6. `make_field_card(object, facts)`：呼叫 Muse Image。
  7. `speak(text, lang)`：前端送去 TTS。
- **結構化輸出**：最終旁白用 `text.format`（Responses 的寫法；Chat Completions 才是 `response_format`）：`{claim, source_url, source_title, confidence, home_comparison, language}`。注意：strict 模式下需 `additionalProperties:false` 且全欄位 required；不可遞迴；巢狀 ≤10。**結構化輸出與 search grounding 同時使用的行為文件未寫，需實測**；備案是分兩次呼叫（先 grounding 取證據，再結構化產出）。
- **「不確定就不說」機制**：旁白 schema 要求 `source_url`；後端驗證 url 網域白名單與 citation 存在；沒有就捨棄這一輪，或只說「這個我沒查到可靠的出處」。
- **代理自主性（Best Agentic Use-Case，$5K）**：Demo 要展現決策過程：何時主動開口、為何選這個物件、何時查證、何時沉默。可顯示「代理思考日誌」（工具呼叫軌跡），對評審有說服力（推論）。Cookbook 的「Basic agent loop」「Multi-turn context management」「Interleaved reasoning and tool use」可參考。
- 其他：prompt caching 可把穩定的 system prompt + 家鄉設定放前綴，降成本（快取輸入 $0.15）。長時間散步要用 multi-turn context management 控制歷史。

---

## 8. 成本估算（推論，數字皆來自文件定價 × 我的假設）

**假設：30 分鐘散步**
- 主動旁白：每 2.5 分鐘一段，約 12 段。每段代理迴圈約 4 輪（地圖工具、記憶工具、搜尋、最後輸出），平均每輪輸入 6K tokens（含歷史與工具結果，部分被快取）、輸出 0.8K（含推理）→ 每段約 24K 輸入、3.2K 輸出、2 次搜尋。
- 拍照 3 張：每張 Spark 看圖 1 輪（約 2K 輸入含圖 + 1K 輸出）、SAM 3 次請求（"person"、"face"、主物件）、旁白 1 輪（約 8K 輸入、1K 輸出）、圖鑑卡 1 張。
- 語音提問 5 次：麥克風串流只在提問時開（每次約 15 秒，共約 2 分鐘）；每個問題代理約 20K 輸入、2K 輸出、1 次搜尋。

| 項目 | 計算 | 約略金額 |
|---|---|---|
| 主動旁白 token（Standard Spark 1.3） | 12 × (24K×$1.25/M + 3.2K×$4.25/M) = 12 × ($0.030+$0.0136) | $0.52 |
| 主動旁白搜尋 | 24 次 × $0.0025 | $0.06 |
| 拍照 token | 3 × (10K×$1.25/M + 2K×$4.25/M) | $0.06 |
| 拍照 SAM | 9 次 × $0.0025 | $0.02 |
| 圖鑑卡 | 3 × $0.01 | $0.03 |
| 語音提問 token | 5 × (20K×$1.25/M + 2K×$4.25/M) | $0.17 |
| 語音提問搜尋 | 5 × $0.0025 | $0.01 |
| 語音轉錄 | 2 分鐘 × $0.18/60 | $0.006 |
| **合計（每次散步）** | | **約 $0.9（寬鬆估 $1.5–$2）** |

- 若主迴圈改用 Muse Wonder（輸入 $4/輸出 $20）：token 部分約 3–4.7 倍，每次散步約 $2.5–$3。
- 若語音全程串流（30 分鐘）：$0.09，仍很低。
- **結論：$150 額度綽綽有餘**。就算開發階段每天跑 20 次完整測試（約 $20–$40），加上實測與 Demo，仍遠低於 $150。真正會吃預算的是：Wonder 主迴圈 + 長歷史 + 高 reasoning effort，或者迴圈失控（沒設輪次與逾時上限）。建議：設 Spend Limit 通知、加 `max_tool_calls` 與自己的輪數上限、用 prompt caching。
- 注意：額度要**先去領**（11/4 21:00 ET 截止，且需綁信用卡）。
- 速率限制（3,000 RPM / 4M TPM per team）對 demo 完全足夠；Contributor 150 RPM 也夠，但隱私考量不建議。

---

## 9. 文件沒寫清楚、需要實測的問題清單

優先級由高到低：

1. **延遲**：Spark 1.3（各 reasoning effort）首 token 時間、帶 web_search 的整體延遲、SAM 單次延遲、Muse Image 單張延遲、Voice Transcribe 首個 partial 與 speechComplete 延遲。**文件完全沒有延遲數字**，直接決定互動體驗。
2. **Voice Transcribe 對台灣華語的輸出是繁體還是簡體**？對台灣用語、中英日夾雜的錯誤率？`keywords` 對地名（OSM 名稱）實際效果？
3. **台灣地區可用性**：Geographic Use Policy 已讀（見第 00 章 A）：台灣不在限制名單，Spark / Voice / SAM 無國家限制，Muse Image 僅印度受限，Wonder 僅南韓受限，「僅美國」說法查無文件依據。剩下只需在註冊與第一次 API 呼叫時實測確認帳號端確實已啟用（Policy 2.1 保留 Meta 可隨時調整）。
4. **瀏覽器 CORS**：能否直接 fetch api.meta.ai？（金鑰安全上仍需代理；但若要快速原型，需知道行為。）WebSocket 是否限制 Origin？
5. **search grounding + 結構化輸出同時使用**的行為；grounding 與 reasoning effort 的互動；search grounding 對中文/日文/台灣在地內容的覆蓋與出處品質；`user_location` 設台灣城市的偏向效果。
6. **web_search 在 Contributor 模式、Muse Wonder 上是否都可用**（文件只描述 Spark/一般文字模型，未逐一列出）。
7. **SAM 3.1**：圖片大小/解析度上限與最佳尺寸；"manhole cover"、"utility pole"、"vending machine" 這類概念的辨識率；"face" vs "person" 的召回率（側臉、遠處、背影）；遮罩解析度（H、W 比原圖小多少）與邊緣精度；在手機直拍大圖（12MP）時是否需要先縮圖。
8. **Spark 看圖座標定位**對街景小物件的準確度（0–1000 正規化）；單張圖送入的最佳解析度（token 成本 vs 準確度）。
9. **Muse Image**：中文字渲染品質；高/低 `reasoning_strength` 的實際速度；以真實照片當參考圖的相似度與是否保留可辨識的人臉（隱私）；內容政策誤擋率。
10. **Spark 1.3 音訊輸入**到底多不穩（若要把語音直接餵 Spark）；1.2 是否在其他功能上有差異。
11. **Responses API 工具迴圈**：`previous_response_id` 的伺服器端保存期限、`store` 預設、跨很多輪（30 分鐘）的 context 增長與成本；`tool_choice` 不能強制，模型有多常「不呼叫工具直接亂說」。
12. **Spark Open on Baseten `-1026`**：是否支援 Responses API 或僅 Chat Completions；是否有內建搜尋（推論：沒有）；速率與價格（文件未載明）；是否能看圖/聽音訊。
13. **Glimmer 在 Together** 的中文/日文品質、看圖座標定位能力（是否也輸出 0–1000 座標）；工具呼叫穩定度。
14. **Glimmer 磁碟大小**文件互相矛盾（60 GB vs 80 GB）。
15. 帳號面：信用卡預授權金額、$150 額度分批發放實際到帳時間、Spend Limit 是否為硬性停止。
16. **iOS Safari / Android Chrome**：`getUserMedia`、AudioWorklet 16/24kHz 取樣、`speechSynthesis` 自動播放限制、螢幕鎖定時 GPS 與音訊是否持續（網頁版散步導遊的關鍵風險，與 Meta 無關但影響 Demo）。
17. **Anti-Projects 的判定**：「Simple Image Analyzers」「Basic RAG」的邊界；可在 Discord #questions 或 #office-hours（每日 10–11 AM ET，Meta 團隊文字回答）詢問。
18. 評審實務：Open Weight 獎項的「合格驗證」流程細節；Best Creative Build 要求「Muse Image 或 Wonder」，是否一定要在最終體驗中佔核心位置（文件：評估「模型在最終體驗中被運用得多有效」）。

---

## 10. 來源 URL 列表

Meta 文件（dev.meta.ai）：
- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/pricing-rate-limits
- https://dev.meta.ai/docs/protocols
- https://dev.meta.ai/docs/authentication
- https://dev.meta.ai/docs/error-handling
- https://dev.meta.ai/docs/search-grounding
- https://dev.meta.ai/docs/tool-calling
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/image-understanding
- https://dev.meta.ai/docs/image-generation
- https://dev.meta.ai/docs/speech-to-text
- https://dev.meta.ai/docs/media-segmentation
- https://dev.meta.ai/docs/sam/overview
- https://dev.meta.ai/docs/sam/segmenting
- https://dev.meta.ai/docs/sam/reading-segmentation
- https://dev.meta.ai/docs/sam/client-libraries
- https://dev.meta.ai/docs/open-weight-models
- https://dev.meta.ai/docs/muse-glimmer
- https://dev.meta.ai/docs/muse-glimmer/hardware-platforms
- https://dev.meta.ai/docs/muse-glimmer/quantization
- https://dev.meta.ai/docs/muse-glimmer/deploy
- https://dev.meta.ai/docs/muse-glimmer/get-the-model
- https://dev.meta.ai/docs/muse-spark-open
- https://dev.meta.ai/docs/muse-spark-open/deploy
- https://dev.meta.ai/docs/agent-frameworks
- https://dev.meta.ai/docs/cookbook
- https://dev.meta.ai/docs/cookbook/voice-api-fundamentals
- https://dev.meta.ai/docs/cookbook/sam-api-basics
- https://dev.meta.ai/docs/cookbook/perception-grounding
- https://dev.meta.ai/docs/cookbook/rayban-openclaw
- https://dev.meta.ai/docs/cookbook/glimmer-api-agent

參賽指南（以 Chrome 讀取，無需登入即可顯示）：
- https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details

未能讀取：https://dev.meta.ai/docs/audio-understanding（404）。未讀：Geographic Use Policy、API reference（handshake 完整欄位）、Muse Spark Open Mac cookbook、search-grounding cookbook、tool search 專頁、prompt caching 專頁、muse-spark-open/hardware-platforms。
