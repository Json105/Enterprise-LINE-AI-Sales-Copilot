# 🚀 Google Apps Script (GAS) 5 分鐘極速部署教學

> **100% 零伺服器維護、零主機費用、企業隱私安全隔離**  
> 依照本教學，您只需透過瀏覽器複製貼上，5 分鐘內即可完成企業專屬 LINE AI 智慧業務助理的部署！

---

## 📋 準備清單

1. **Google 帳號**（個人 Gmail 或企業 Google Workspace 皆可）。
2. **LINE Developers 帳號**（取得 `Channel Access Token`）。
3. **OpenAI API Key**（推薦使用 `gpt-4o-mini`）或 **Google Gemini API Key**。

---

## 🛠️ 一鍵部署 4 步驟

### 步驟 1：建立 Google 試算表與開啟 Apps Script
1. 開啟 [Google 雲端硬碟](https://drive.google.com/)，點擊「新增」➔「Google 試算表」，將試算表命名為 `【業務部】LINE AI 拜訪紀錄與 CRM 看板`。
2. 點擊頂部選單的 **「擴充功能」➔「Apps Script」**。
3. 將專案名稱重新命名為 `LINE-AI-Sales-Copilot`。

---

### 步驟 2：貼上程式碼
1. 將原本編輯器中的程式碼清空。
2. 開啟本專案的 **[`gas/Code.gs`](./Code.gs)**，複製全部內容並貼到 Apps Script 編輯器中。
3. 點擊上方的 **「儲存」💾** 圖示。

---

### 步驟 3：設定專案環境變數 (Script Properties)
為了確保資安與隱私，API Key 與 Token 絕不寫死在程式碼中：

1. 點擊左側齒輪圖示 **「專案設定」⚙️**。
2. 向下滾動找到 **「指令碼屬性 (Script Properties)」**，點擊 **「新增指令碼屬性」**，填入以下鍵值：

| 屬性名稱 (Property) | 範例值 (Value) | 說明 |
| :--- | :--- | :--- |
| `LINE_CHANNEL_ACCESS_TOKEN` | `eyJhbGciOi...` | 於 LINE Developers 後台 Messaging API 取得之長期 Token |
| `LLM_PROVIDER` | `openai` 或 `gemini` | 選擇 AI 大腦核心（預設推薦 `openai`） |
| `OPENAI_API_KEY` | `sk-proj-...` | 您的 OpenAI API Key（若選 openai） |
| `GEMINI_API_KEY` | `AIzaSy...` | 您的 Google Gemini API Key（若選 gemini） |
| `ENABLE_SHEET_LOGGING` | `true` 或 `false` | 是否自動將 BANT 紀錄同步寫入當前 Google 試算表 |
| `ENABLE_WHITELIST` | `false` 或 `true` | 是否開啟員工白名單過濾（非必填，預設 false） |
| `WHITELIST_USER_IDS` | `U1234...,U5678...` | 授權之 LINE User ID 逗號分隔（若開啟白名單） |

3. 點擊 **「儲存指令碼屬性」**。

---

### 步驟 4：發布為網頁應用程式 (Web App) 並綁定 LINE Webhook
1. 回到編輯器右上角，點擊 **「部署 (Deploy)」➔「新的部署 (New deployment)」**。
2. 點擊左側齒輪圖示，選擇 **「網頁應用程式 (Web app)」**。
3. 填寫部署設定：
   - **說明**：`v1.0.0 Production`
   - **執行身分 (Execute as)**：`我 (Your Google Account)`
   - **誰可以存取 (Who has access)**：`所有人 (Anyone)`  <-- **重要！必須選所有人，LINE 伺服器才能發送 Webhook**
4. 點擊 **「部署」**。首次部署時，Google 會要求授權權限，請點選「審查權限」➔ 選擇您的 Google 帳號 ➔ 點「進階 (Advanced)」➔「前往 LINE-AI-Sales-Copilot (不安全)」➔ 點「允許」。
5. 複製產生的 **「網頁應用程式網址 (Web App URL)」**（格式如 `https://script.google.com/macros/s/AKfycb.../exec`）。
6. 前往 [LINE Developers Console](https://developers.line.biz/console/) ➔ 點進您的 Messaging API Channel ➔ **Messaging API** 分頁：
   - 將剛複製的網址貼入 **Webhook URL**。
   - 開啟 **Use Webhook** 開關。
   - 點擊 **Verify** 按鈕確認回傳 Success。
7. 在 LINE 官方帳號設定中，將 **「自動回應訊息」關閉**，避免與 AI 回覆衝突。

---

## 📱 測試與驗證

現在拿起您的手機，加入該 LINE 官方帳號好友，傳送一段口語測試：

> **測試輸入**：  
> *「今天下午拜訪了某某公司採購王經理，他們想為門市更換新版系統，預算大約 150 萬，預計今年 Q4 之前要定案。目前的痛點是舊系統常當機，競品有其他廠商在報價。約好下週三下午 2 點帶工程師去展示 Demo。」*

🤖 **AI 助理將在 3 秒內自動回覆標準的【BANT 業務拜訪結構化報告】與【客戶感謝跟進 LINE 訊息草稿】！**
