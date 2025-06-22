console.log("✅ 当前 server.js 已运行。");

const express = require("express");
const cors = require("cors");
const path = require("path");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// === Coze 配置 ===
const COZE_API_TOKEN = "pat_U2bQqBUmIocUfPT8NrmJ9xU7VPIcDQUgyn52BjAVKOfWdgLkqnWbaZlSJ7o9hObL";
const COZE_WORKFLOW_ID = "7516336286320558090";
const COZE_APP_ID = "7516257983312117798";
const COZE_RUN_API = "https://api.coze.cn/v1/workflow/run";
const COZE_RESULT_API_BASE = "https://api.coze.cn/v1/workflows";

// ✅ /api/chat 接口
app.post("/api/chat", async (req, res) => {
  console.log("✅ 收到 POST /api/chat 请求");
  const { user_id = "default_user", content } = req.body;

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: "USER_INPUT 不合法或为空" });
  }

  try {
    // Step 1: 调用 Coze 启动异步工作流
    const cozeRequestBody = {
      workflow_id: COZE_WORKFLOW_ID,
      app_id: COZE_APP_ID,
      is_async: true,
      parameters: {
        USER_INPUT: content
      }
    };

    console.log("🚀 启动工作流参数:", JSON.stringify(cozeRequestBody, null, 2));

    const initRes = await fetch(COZE_RUN_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COZE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cozeRequestBody)
    });

    const initData = await initRes.json();
    console.log("📥 Coze 返回内容：", initData);

    // ✅ 提取 execute_id（兼容 raw 结构）
    const execute_id = initData.execute_id || initData.raw?.execute_id;
    console.log("✅ execute_id 获取成功：", execute_id);

    if (!execute_id) {
      console.error("❌ execute_id 获取失败：", initData);
      return res.status(500).json({ error: "未获取到 execute_id", raw: initData });
    }

    // Step 2: 轮询获取执行结果
    const result = await pollCozeResult(execute_id);
    return res.json({ answer: result });

  } catch (err) {
    console.error("💥 服务端异常：", err);
    return res.status(500).json({ error: err.message || "未知错误" });
  }
});

// 🔄 工具函数：轮询结果
async function pollCozeResult(execute_id, maxTries = 6, delayMs = 10000) {
  console.log(`⏳ 正在轮询结果（ID: ${execute_id}）...`);

  for (let i = 0; i < maxTries; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const res = await fetch(`${COZE_RESULT_API_BASE}/${COZE_WORKFLOW_ID}/run_histories/${execute_id}`, {
      headers: {
        "Authorization": `Bearer ${COZE_API_TOKEN}`
      }
    });

    const data = await res.json();
    const exec = data?.data?.[0];

    console.log(`🔁 第 ${i + 1} 次轮询状态:`, exec?.execute_status);

    if (exec?.execute_status === "Success") {
      try {
        const outputRaw = JSON.parse(exec.output || "{}");
        const output = JSON.parse(outputRaw.Output || "{}");
        return output.data || "AI 执行完成，但未返回结果。";
      } catch (e) {
        throw new Error("结果解析失败：" + e.message);
      }
    }

    if (exec?.execute_status === "Failed") {
      throw new Error("工作流执行失败：" + (exec.error_message || "未知错误"));
    }
  }

  throw new Error("获取结果超时，请稍后重试。");
}

// ✅ 启动服务
app.listen(3000, () => {
  console.log("🌐 服务已启动：http://localhost:3000");
});
