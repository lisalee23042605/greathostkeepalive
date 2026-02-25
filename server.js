import express from "express";
import { chromium } from "playwright";

const app = express();

// ========= 必填环境变量 =========
const LOGIN_URL = process.env.LOGIN_URL;   // https://greathost.es/login
const PANEL_URL = process.env.PANEL_URL;   // https://greathost.es/contracts/<id>
const USERNAME  = process.env.USERNAME;
const PASSWORD  = process.env.PASSWORD;

// ========= 可选环境变量 =========
const MAX_HOURS = Number(process.env.MAX_HOURS || "120");              // 上限
const SKIP_IF_GE_HOURS = Number(process.env.SKIP_IF_GE_HOURS || "100"); // >=100 不点
const CHECK_EVERY_HOURS = Number(process.env.CHECK_EVERY_HOURS || "3"); // 每隔几小时检查一次
const HEADLESS = (process.env.HEADLESS ?? "true").toLowerCase() !== "false";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || "30000");
const PORT = Number(process.env.PORT || "3000");

// ======== 内存状态（服务重启会清空；但一般够用展示“在线/实时”）========
const state = {
  online: true,
  startedAt: new Date().toISOString(),
  lastCheckAt: null,
  nextCheckAt: null,
  lastAction: null,        // "clicked" | "skip_threshold" | "skip_wait" | "skip_no_button" | "error"
  lastWaitText: null,      // "Wait 24 min"
  accumulatedHours: null,  // number
  remainingHours: null,    // number
  lastError: null,
  lastLog: []
};

function must(v, name) {
  if (!v) throw new Error(`Missing env: ${name}`);
}

function pushLog(line) {
  const s = `[${new Date().toISOString()}] ${line}`;
  state.lastLog.push(s);
  if (state.lastLog.length > 80) state.lastLog.shift();
  console.log(s);
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

  const userInput = page.locator(
    'input[name="email"], input[type="email"], input[name="username"], input[placeholder*="mail" i], input[placeholder*="user" i]'
  );
  const passInput = page.locator(
    'input[name="password"], input[type="password"], input[placeholder*="pass" i]'
  );

  await userInput.first().waitFor({ timeout: TIMEOUT_MS });
  await passInput.first().waitFor({ timeout: TIMEOUT_MS });

  await userInput.first().fill(USERNAME);
  await passInput.first().fill(PASSWORD);

  const loginBtn = page.locator(
    'button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in"), input[type="submit"]'
  );
  await loginBtn.first().click({ timeout: TIMEOUT_MS });

  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => {});
}

function parseHoursFromText(text) {
  // 兼容 "12 hours" / "12.5 hours"
  const m = text.replace(",", ".").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : NaN;
}

async function checkAndRenew() {
  state.lastError = null;
  state.lastWaitText = null;

  state.lastCheckAt = new Date().toISOString();
  const next = new Date(Date.now() + CHECK_EVERY_HOURS * 3600 * 1000);
  state.nextCheckAt = next.toISOString();

  pushLog("Check start...");

  let browser;
  try {
    must(LOGIN_URL, "LOGIN_URL");
    must(PANEL_URL, "PANEL_URL");
    must(USERNAME, "USERNAME");
    must(PASSWORD, "PASSWORD");

    browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    // 1) 登录
    pushLog("Logging in...");
    await login(page);

    // 2) 打开合同页
    pushLog("Opening contract page...");
    await page.goto(PANEL_URL, { waitUntil: "networkidle", timeout: TIMEOUT_MS });

    // 3) 锁定 Renewal Information 卡片
    const renewalTitle = page.getByText("Renewal Information", { exact: true });
    await renewalTitle.waitFor({ timeout: TIMEOUT_MS });

    // 从标题往上拿大容器；如果 UI 改动，这里最可能需要调 ancestor 层级
    const renewalCard = renewalTitle.locator("xpath=ancestor::div[2]");

    // 4) 读取累计小时
    const accumulatedLabel = renewalCard.getByText("Accumulated time", { exact: false });
    await accumulatedLabel.waitFor({ timeout: TIMEOUT_MS });

    const accumulatedBlock = accumulatedLabel.locator("xpath=ancestor::div[1]");
    const accumulatedText = (await accumulatedBlock.innerText()).trim();

    let hours = NaN;
    const hm = accumulatedText.match(/(\d+(\.\d+)?)\s*hours?/i);
    if (hm) hours = Number(hm[1]);
    if (Number.isNaN(hours)) hours = parseHoursFromText(accumulatedText);

    if (Number.isNaN(hours)) {
      throw new Error(`Could not parse accumulated hours. Text: ${accumulatedText}`);
    }

    state.accumulatedHours = hours;
    state.remainingHours = Math.max(0, MAX_HOURS - hours);
    pushLog(`Accumulated hours = ${hours}, Remaining = ${state.remainingHours}`);

    // 5) 阈值判断
    if (hours >= SKIP_IF_GE_HOURS) {
      state.lastAction = "skip_threshold";
      pushLog(`Skip: hours >= ${SKIP_IF_GE_HOURS}`);
      return;
    }

    // 6) 冷却判断：Wait xx min
    const waitBtn = renewalCard.locator('button:has-text("Wait")');
    if (await waitBtn.first().isVisible().catch(() => false)) {
      const waitText = (await waitBtn.first().innerText().catch(() => "")).trim();
      state.lastAction = "skip_wait";
      state.lastWaitText = waitText || "Wait";
      pushLog(`Skip: cooldown detected: ${state.lastWaitText}`);
      return;
    }

    // 7) 点击 Renew
    const renewBtn = renewalCard.locator('button:has-text("Renew")');
    if (!(await renewBtn.first().isVisible().catch(() => false))) {
      state.lastAction = "skip_no_button";
      pushLog("Skip: Renew button not visible.");
      return;
    }

    await renewBtn.first().click();
    state.lastAction = "clicked";
    pushLog("✅ Renew clicked.");

    // 8) 等待 UI 切到 Wait
    await page.waitForTimeout(1500);
    if (await waitBtn.first().isVisible().catch(() => false)) {
      const waitTextAfter = (await waitBtn.first().innerText().catch(() => "")).trim();
      state.lastWaitText = waitTextAfter || "Wait";
      pushLog(`After click: ${state.lastWaitText}`);
    } else {
      pushLog("After click: Wait not detected (UI may differ).");
    }

  } catch (err) {
    state.lastAction = "error";
    state.lastError = String(err?.stack || err);
    pushLog(`❌ Error: ${state.lastError}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    pushLog("Check end.");
  }
}

// ===== Web 页面 =====
app.get("/", (_req, res) => {
  const s = state;
  const statusBadge = s.lastAction === "error" ? "🔴 Error" : "🟢 OK";
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GreatHost Renew Status</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;max-width:900px;margin:24px auto;padding:0 16px;}
    .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .k{color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
    .v{font-size:18px;margin-top:4px}
    pre{background:#0b1020;color:#e5e7eb;padding:12px;border-radius:12px;overflow:auto}
    button{padding:10px 14px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer}
  </style>
</head>
<body>
  <h1>GreatHost Renew Bot</h1>
  <div class="card">
    <div class="row">
      <div><div class="k">Service</div><div class="v">${statusBadge}</div></div>
      <div><div class="k">Started At</div><div class="v">${s.startedAt || "-"}</div></div>
      <div><div class="k">Last Check</div><div class="v">${s.lastCheckAt || "-"}</div></div>
      <div><div class="k">Next Check</div><div class="v">${s.nextCheckAt || "-"}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="row">
      <div><div class="k">Accumulated</div><div class="v">${s.accumulatedHours ?? "-" } hours</div></div>
      <div><div class="k">Remaining</div><div class="v">${s.remainingHours ?? "-" } / ${MAX_HOURS} hours</div></div>
      <div><div class="k">Threshold</div><div class="v">skip if ≥ ${SKIP_IF_GE_HOURS}h</div></div>
      <div><div class="k">Last Action</div><div class="v">${s.lastAction || "-"}</div></div>
      <div><div class="k">Cooldown</div><div class="v">${s.lastWaitText || "-"}</div></div>
    </div>
    <div style="margin-top:12px">
      <button onclick="fetch('/run',{method:'POST'}).then(()=>location.reload())">Run Now</button>
      <button onclick="location.reload()">Refresh</button>
    </div>
  </div>

  ${s.lastError ? `<div class="card"><div class="k">Last Error</div><pre>${escapeHtml(s.lastError)}</pre></div>` : ""}

  <div class="card">
    <div class="k">Recent Logs</div>
    <pre>${escapeHtml((s.lastLog || []).slice(-60).join("\\n") || "")}</pre>
  </div>

<script>
  // 每 20 秒自动刷新
  setTimeout(()=>location.reload(), 20000);
</script>
</body>
</html>`);
});

// JSON 状态（给你做探针/外部监控也方便）
app.get("/status", (_req, res) => res.json(state));

// 手动触发一次（页面按钮用）
app.post("/run", async (_req, res) => {
  checkAndRenew().finally(() => {});
  res.json({ ok: true });
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 启动 web
app.listen(PORT, () => {
  pushLog(`Web listening on :${PORT}`);
});

// 启动后立即跑一次，然后按间隔跑
(async () => {
  await checkAndRenew();
  setInterval(checkAndRenew, CHECK_EVERY_HOURS * 3600 * 1000);
})();
