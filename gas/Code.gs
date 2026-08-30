/**
 * ==============================================================================
 * 專案名稱：企業級 LINE AI 業務助理 (Enterprise LINE AI Sales Copilot)
 * 運行環境：Google Apps Script (GAS) Serverless 架構
 * 資安規範：100% 隱私隔離、無狀態記憶體運算、Zero-Log 零明文日誌
 * 授權條款：MIT License (Copyright (c) 2026 Json105)
 * ==============================================================================
 */

// ==============================================================================
// 一、 系統提示詞設定 (完整高實用度業務顧問版)
// ==============================================================================
const SYSTEM_PROMPT = `
你是一位頂尖的企業級「外勤與內勤智慧業務助理（Sales Copilot）」。
你的職責是協助第一線外勤業務人員與內勤助理，以最高效率完成拜訪紀錄結構化、商務郵件擬稿、長信爭議分析與異議攻防。

【回覆準則與語言規範】
1. 一律使用繁體中文（台灣習慣之商業術語，如：專案、時程、報價、客戶、規格）。
2. 語氣專業、俐落、結構嚴密、條理分明，避免無意義的客套與廢話。
3. 根據使用者輸入之內容，自動判斷並採取以下相應的輸出框架：

--------------------------------------------------
【框架一：BANT 業務拜訪紀錄結構化】
當使用者傳送口語拜訪筆記、語音速記或碎片化對話時，請務必輸出完整下列項目：
📋【BANT 業務拜訪結構化報告】
• 🏢 客戶名稱/主題：(若未提及請標註待補)
• 💰 Budget (預算規模)：(具體金額、預算範圍或付款條件)
• 👤 Authority (決策權與關係鏈)：(關鍵決策者 Key Man、反對者、影響者角色)
• 🎯 Need (核心需求與痛點)：(客戶最急迫欲解決之問題與功能期待)
• ⏳ Timeline (預計導入時程)：(預計上線、評估、簽約之具體時間點)
• ⚔️ 競爭態勢與風險：(競品比較、潛在成交阻礙與我方攻防策略)
• 🚀 Next Actions (下一步行動)：
  1. [待辦事項] (負責人 / 預計截止日期)
• 💬 跟進 LINE 訊息草稿 (可直接複製傳送給客戶)：
  「(100字內，語氣誠懇專業，感謝今日會面並確認下一步的精簡草稿)」

--------------------------------------------------
【框架二：商務郵件與通訊擬稿】
當使用者要求撰寫回信、公文或回覆刁難訊息時：
• 提供 1~2 款語氣得體、邏輯嚴密、保護我方權益的完整信件模板（含主旨與正文）。
• 若涉及「拒絕降價」，採取「堅守價值＋委婉致歉＋提供替代贈品/增值服務」策略。
• 若涉及「交期延誤/異常」，採取「主動說明現況＋具體補救措施＋明確交付時間點」策略。

--------------------------------------------------
【框架三：客戶長信爭議點與待辦萃取】
當使用者轉貼長篇客戶信件或會議紀錄時：
• 🎯 核心訴求摘要 (3 點以內)
• ⚠️ 潛在風險與合約/規格爭議點
• 📌 我方需回覆或行動之清單
--------------------------------------------------
`;

// ==============================================================================
// 二、 Webhook 接收與事件分流 (POST Request Entry Point)
// ==============================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: "error", message: "No post data received" });
    }

    const requestData = JSON.parse(e.postData.contents);
    const events = requestData.events;

    if (!events || events.length === 0) {
      return createJsonResponse({ status: "ok", message: "No events to process" });
    }

    // 讀取環境變數 (Script Properties)
    const scriptProperties = PropertiesService.getScriptProperties();
    const lineToken = scriptProperties.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    const enableWhitelist = scriptProperties.getProperty("ENABLE_WHITELIST") === "true";
    const whitelist = (scriptProperties.getProperty("WHITELIST_USER_IDS") || "").split(",").map(id => id.trim());

    if (!lineToken) {
      safeLog("WARN", "LINE_CHANNEL_ACCESS_TOKEN is not configured.");
      return createJsonResponse({ status: "error", message: "Missing LINE Token" });
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.type === "message") {
        const userId = event.source.userId || "anonymous";
        const replyToken = event.replyToken;
        const msgType = event.message.type;

        // 1. 白名單安全檢查 (若啟用)
        if (enableWhitelist && !whitelist.includes(userId)) {
          safeLog("AUTH", "Blocked unauthorized user: " + userId);
          replyToLine(replyToken, "🔒 本助理為企業內部專屬業務 Copilot，您的 LINE 帳號尚未獲得授權。\n請聯繫系統管理員開通權限。", lineToken);
          continue;
        }

        // 2. 每日使用額度防濫用檢查 (若啟用)
        const quotaCheck = checkAndUpdateDailyQuota(userId, scriptProperties);
        if (!quotaCheck.allowed) {
          replyToLine(replyToken, quotaCheck.message, lineToken);
          continue;
        }

        // 3. 觸發 LINE 原生「正在輸入中...」讀取動畫
        showLineLoadingAnimation(userId, lineToken);

        let userPrompt = "";
        let aiResponse = "";

        // ==========================================
        // 模式 A：純文字訊息處理 (BANT 速記 / 郵件擬稿)
        // ==========================================
        if (msgType === "text") {
          userPrompt = event.message.text.trim();
          aiResponse = callCommercialLLM(userPrompt, scriptProperties);
        }

        // ==========================================
        // 模式 B：LINE 錄音檔直接聽懂 (Audio Message)
        // ==========================================
        else if (msgType === "audio") {
          const messageId = event.message.id;
          const audioData = getLineContentBase64(messageId, lineToken);
          if (audioData) {
            userPrompt = "🎙️ [語音速記錄音檔]";
            const prompt = "請仔細聆聽這段第一線業務的外勤語音速記，並嚴格依據標準 BANT 框架整理成結構化報告、競品攻防策略、Next Actions 與跟進 LINE 草稿。";
            aiResponse = callGeminiMultimodalAPI(prompt, "audio/m4a", audioData.base64, scriptProperties);
          } else {
            aiResponse = "⚠️ 無法讀取語音錄音檔，請稍後重試。";
          }
        }

        // ==========================================
        // 模式 C：PDF / 文件即時審閱解析 (File Message)
        // ==========================================
        else if (msgType === "file") {
          const messageId = event.message.id;
          const fileName = event.message.fileName || "文件";
          const fileData = getLineContentBase64(messageId, lineToken);

          if (fileData) {
            userPrompt = "📄 [上傳文件: " + fileName + "]";
            const prompt = "你是一位資深商務法務與銷售顧問，請詳細審閱這份客戶商務文件 (" + fileName + ")，並依序輸出：\n" +
              "1. 🎯 核心內容與規格訴求摘要 (3-5點)\n" +
              "2. ⚠️ 商業條件、合約責任、交期或規格爭議風險\n" +
              "3. 🚀 我方建議採取之攻防策略與 Next Actions 清單";
            aiResponse = callGeminiMultimodalAPI(prompt, fileData.mimeType, fileData.base64, scriptProperties);
          } else {
            aiResponse = "⚠️ 無法下載此文件檔案，請確認檔案大小在 25MB 以內。";
          }
        } else {
          // 其他不支援的訊息類型 (如貼圖/影片)
          replyToLine(replyToken, "👋 業務助理已在線！我支援：\n1. 💬 文字拜訪速記\n2. 🎙️ 錄音語音訊息 (直接說話)\n3. 📄 PDF/合約/規格書檔案\n請傳送上述內容，我將為您即刻分析！", lineToken);
          continue;
        }

        // 4. 立即回覆 LINE 聊天室
        replyToLine(replyToken, aiResponse, lineToken);

        // 5. 背景自動歸檔至 Google Sheets CRM 看板
        const enableSheetLog = scriptProperties.getProperty("ENABLE_SHEET_LOGGING") === "true";
        if (enableSheetLog) {
          saveRecordToSheet(userId, userPrompt, aiResponse);
        }
      }
    }

    return createJsonResponse({ status: "ok" });
  } catch (err) {
    safeLog("ERROR", "Unhandled error in doPost: " + err.message);
    return createJsonResponse({ status: "error", message: err.message });
  }
}

// ==============================================================================
// 三、 商業級 LLM API 調用引擎 (極速配置：gemini-2.0-flash 1.5秒秒回)
// ==============================================================================
function callCommercialLLM(promptText, scriptProperties) {
  const provider = (scriptProperties.getProperty("LLM_PROVIDER") || "gemini").toLowerCase();

  if (provider === "openai") {
    return callOpenAIAPI(promptText, scriptProperties);
  } else {
    return callGeminiAPI(promptText, scriptProperties);
  }
}

function callOpenAIAPI(userText, scriptProperties) {
  const apiKey = scriptProperties.getProperty("OPENAI_API_KEY");
  if (!apiKey) return "⚠️ 尚未設定 OPENAI_API_KEY。";

  const url = "https://api.openai.com/v1/chat/completions";
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText }
    ],
    temperature: 0.3,
    max_tokens: 1500
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const resJson = JSON.parse(response.getContentText());
    if (response.getResponseCode() === 200 && resJson.choices && resJson.choices.length > 0) {
      return resJson.choices[0].message.content.trim();
    }
    return "⚠️ AI 回應異常：" + (resJson.error ? resJson.error.message : "請稍後重試");
  } catch (e) {
    return "⚠️ 連線異常: " + e.message;
  }
}

/**
 * 調用 Google Gemini API (商業付費層：Gemini 3 官方旗艦陣列 3.7-flash -> 3.5-flash -> 3.1-flash-lite -> 2.0-flash)
 */
function callGeminiAPI(userText, scriptProperties) {
  const apiKey = scriptProperties.getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    return "⚠️ 系統尚未設定 GEMINI_API_KEY，請於 Google Apps Script 專案設定中填入金鑰。";
  }

  // 🥇 首選最強商業推理 3.7-flash，並以 3.5-flash、3.1-flash-lite 與 2.0-flash 作為高可用備援
  const primaryModel = scriptProperties.getProperty("GEMINI_MODEL") || "gemini-3.7-flash";
  const candidateModels = [primaryModel, "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.0-flash"];
  const modelsToTry = candidateModels.filter((v, i, a) => a.indexOf(v) === i);

  let lastErrorDetail = "未知原因";

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

    const payload = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500 // 充足空間確保輸出完整不中斷
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const responseBody = JSON.parse(response.getContentText());

      if (statusCode === 200 && responseBody.candidates && responseBody.candidates.length > 0) {
        return responseBody.candidates[0].content.parts[0].text.trim();
      } else {
        const errorMsg = responseBody.error ? responseBody.error.message : ("狀態碼 " + statusCode);
        lastErrorDetail = "[" + model + " 錯誤]: " + errorMsg;
        safeLog("WARN", lastErrorDetail);
      }
    } catch (e) {
      lastErrorDetail = "[" + model + " 連線異常]: " + e.message;
      safeLog("WARN", lastErrorDetail);
    }
  }

  return "⚠️ Gemini API 呼叫異常，詳細診斷：" + lastErrorDetail;
}

/**
 * 調用 Google Gemini 多模態 API (支援語音 .m4a 錄音檔與 PDF/文件)
 */
function callGeminiMultimodalAPI(promptText, mimeType, base64Data, scriptProperties) {
  const apiKey = scriptProperties.getProperty("GEMINI_API_KEY");
  if (!apiKey) return "⚠️ 尚未設定 GEMINI_API_KEY。";

  const primaryModel = scriptProperties.getProperty("GEMINI_MODEL") || "gemini-3.7-flash";
  const candidateModels = [primaryModel, "gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.0-flash"];
  const modelsToTry = candidateModels.filter((v, i, a) => a.indexOf(v) === i);

  let lastError = "";

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

    const payload = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500
      }
    };

    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const statusCode = response.getResponseCode();
      const resJson = JSON.parse(response.getContentText());

      if (statusCode === 200 && resJson.candidates && resJson.candidates.length > 0) {
        return resJson.candidates[0].content.parts[0].text.trim();
      } else {
        lastError = "[" + model + "]: " + (resJson.error ? resJson.error.message : ("HTTP " + statusCode));
        safeLog("WARN", "Multimodal fetch failed: " + lastError);
      }
    } catch (e) {
      lastError = "[" + model + "]: " + e.message;
      safeLog("WARN", "Multimodal exception: " + lastError);
    }
  }

  return "⚠️ 多模態分析失敗，原因：" + lastError;
}

/**
 * 從 LINE 官方 API 下載音訊或文件檔案並轉為 Base64
 */
function getLineContentBase64(messageId, lineToken) {
  try {
    const url = "https://api-data.line.me/v2/bot/message/" + messageId + "/content";
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + lineToken },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      const blob = response.getBlob();
      return {
        base64: Utilities.base64Encode(blob.getBytes()),
        mimeType: blob.getContentType() || "application/octet-stream"
      };
    } else {
      safeLog("ERROR", "Failed to fetch content from LINE API, code: " + response.getResponseCode());
      return null;
    }
  } catch (e) {
    safeLog("ERROR", "getLineContentBase64 error: " + e.message);
    return null;
  }
}

/**
 * 3人團隊每日額度防濫用控管機制 (支援自訂每日上限與自動跨日重置)
 */
function checkAndUpdateDailyQuota(userId, scriptProperties) {
  const enableQuota = scriptProperties.getProperty("ENABLE_QUOTA_LIMIT") === "true";
  if (!enableQuota) {
    return { allowed: true }; // 若未啟用額度限制，直接放行
  }

  const maxDailyLimit = parseInt(scriptProperties.getProperty("DAILY_QUOTA_LIMIT") || "50", 10);
  const today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd");
  const cache = CacheService.getScriptCache();
  const cacheKey = "QUOTA_" + userId + "_" + today;

  let currentCount = parseInt(cache.get(cacheKey) || "0", 10);

  if (currentCount >= maxDailyLimit) {
    safeLog("WARN", "User " + userId + " exceeded daily quota of " + maxDailyLimit);
    return {
      allowed: false,
      message: "⚠️ 提醒：您今日的商務 AI 使用額度已達上限 (" + maxDailyLimit + "/" + maxDailyLimit + ") 次。\n額度將於明日凌晨自動重置。若有緊急業務需求，請聯繫系統管理員。"
    };
  }

  currentCount++;
  cache.put(cacheKey, currentCount.toString(), 86400); // 快取保留 24 小時

  return { allowed: true, current: currentCount, max: maxDailyLimit };
}

// ==============================================================================
// 四、 LINE Messaging API 回覆發送器 (含原生 Loading 動畫)
// ==============================================================================

/**
 * 觸發 LINE 原生「正在輸入中...」載入動畫 (提升使用者即時感)
 */
function showLineLoadingAnimation(chatId, channelAccessToken) {
  try {
    const url = "https://api.line.me/v2/bot/chat/loading/start";
    const payload = {
      chatId: chatId,
      loadingSeconds: 15
    };
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + channelAccessToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    // 忽略 loading 動畫錯誤，不影響主回覆
  }
}
function replyToLine(replyToken, messageText, channelAccessToken) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: messageText
      }
    ]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + channelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    safeLog("INFO", "LINE Reply sent with status: " + response.getResponseCode());
  } catch (e) {
    safeLog("ERROR", "Failed to send LINE reply: " + e.message);
  }
}

// ==============================================================================
// 五、 Google Sheets 雲端 CRM 業務看板自動歸檔模組
// ==============================================================================
function saveRecordToSheet(userId, rawInput, aiOutput) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const sheetId = scriptProperties.getProperty("SPREADSHEET_ID");
    
    let spreadsheet;
    if (sheetId && sheetId.trim() !== "") {
      spreadsheet = SpreadsheetApp.openById(sheetId.trim());
    } else {
      spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!spreadsheet) {
      safeLog("WARN", "No spreadsheet linked. Please set SPREADSHEET_ID in Script Properties.");
      return;
    }

    let sheet = spreadsheet.getSheetByName("業務拜訪記錄");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("業務拜訪記錄");
      sheet.appendRow(["紀錄時間", "業務 UserID", "原始輸入摘記", "AI 結構化報告"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1B73E8").setFontColor("#FFFFFF");
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 220);
      sheet.setColumnWidth(3, 300);
      sheet.setColumnWidth(4, 550);
      sheet.setFrozenRows(1);
    }

    const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timestamp, userId, rawInput.substring(0, 300), aiOutput]);
    safeLog("INFO", "Record successfully appended to Google Sheet CRM.");
  } catch (err) {
    safeLog("ERROR", "Failed to save record to Sheet: " + err.message);
  }
}

// ==============================================================================
// 六、 資安 Zero-Log 與工具函數
// ==============================================================================
function safeLog(level, message) {
  // 嚴格落實無日誌原則：絕不輸出使用者輸入之商業機密與對話文字，僅記錄狀態
  console.log("[" + level + "] " + new Date().toISOString() + " - " + message);
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 支援瀏覽器 GET 請求進行健康檢查
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "LINE AI Sales Copilot Webhook",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 七、 管理員一鍵測試與環境初始化工具 (在 GAS 編輯器中直接執行)
// ==============================================================================

/**
 * 測試 1：測試 LLM 連線與 API Key 是否有效
 */
function testLLMConnection() {
  const props = PropertiesService.getScriptProperties();
  const testInput = "今天拜訪了某某公司採購經理王經理，預算約200萬，預計Q4導入，競品有外商大廠，下週二要送報價單。";
  const result = callCommercialLLM(testInput, props);
  Logger.log("=== 測試輸出結果 ===");
  Logger.log(result);
}

/**
 * 測試 2：初始化 Google Sheets 業務看板表頭
 */
function setupCRMSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    Logger.log("請確保此腳本是從 Google 試算表內部的「擴充功能 > Apps Script」開啟。");
    return;
  }
  let sheet = spreadsheet.getSheetByName("業務拜訪記錄");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("業務拜訪記錄");
  }
  sheet.clear();
  sheet.appendRow(["紀錄時間", "業務 UserID", "原始輸入摘記", "AI 結構化報告"]);
  sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1B73E8").setFontColor("#FFFFFF");
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 500);
  Logger.log("✅ Google 試算表 CRM 看板已成功初始化完成！");
}
