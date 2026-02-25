import { chromium } from "playwright";

// ========= 必填环境变量 =========
const LOGIN_URL = process.env.LOGIN_URL;   // 例如 https://greathost.es/login
const PANEL_URL = process.env.PANEL_URL;   // 例如 https://greathost.es/contracts/<id>
const USERNAME  = process.env.USERNAME;    // 登录邮箱/用户名
const PASSWORD  = process.env.PASSWORD;    // 登录密码

// ========= 可选环境变量 =========
const THRESHOLD_HOURS = Number(process.env.SKIP_IF_GE_HOURS || "100"); // >=100 小时不点
const HEADLESS = (process.env.HEADLESS ?? "true").toLowerCase() !== "false";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || "30000");

function must(v, name) {
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
}

function parseHours(text) {
  // "12 hours" / "12.5 hours" / 任何包含数字的情况
  const m = text.replace(",", ".").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : NaN;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

  // 尽量兼容常见登录表单（email/username + password）
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

async function main() {
  must(LOGIN_URL, "LOGIN_URL");
  must(PANEL_URL, "PANEL_URL");
  must(USERNAME, "USERNAME");
  must(PASSWORD, "PASSWORD");

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    console.log("1) Logging in...");
    await login(page);

    console.log("2) Opening panel...");
    await page.goto(PANEL_URL, { waitUntil: "networkidle", timeout: TIMEOUT_MS });

    // 3) 锁定右侧“Renewal Information”卡片（避免误点其它按钮）
    const renewalTitle = page.getByText("Renewal Information", { exact: true });
    await renewalTitle.waitFor({ timeout: TIMEOUT_MS });

    // 从标题往上取一个较大的容器（DOM 微调时这里最可能需要改层级）
    const renewalCard = renewalTitle.locator("xpath=ancestor::div[2]");

    // 4) 读取 Accumulated time 的小时数
    const accumulatedLabel = renewalCard.getByText("Accumulated time", { exact: false });
    await accumulatedLabel.waitFor({ timeout: TIMEOUT_MS });

    const accumulatedBlock = accumulatedLabel.locator("xpath=ancestor::div[1]");
    const accumulatedText = (await accumulatedBlock.innerText()).trim();

    let hours = NaN;
    const hm = accumulatedText.match(/(\d+(\.\d+)?)\s*hours?/i);
    if (hm) hours = Number(hm[1]);
    if (Number.isNaN(hours)) hours = parseHours(accumulatedText);

    if (Number.isNaN(hours)) {
      console.log("❌ Could not parse accumulated hours. Text was:\n", accumulatedText);
      process.exit(2);
    }

    console.log("Accumulated hours =", hours);

    // 5) 阈值判断：>=100 不点
    if (hours >= THRESHOLD_HOURS) {
      console.log(`Skip: hours >= ${THRESHOLD_HOURS}`);
      return;
    }

    // 6) 冷却判断：按钮显示 Wait xx min 则不点
    const waitBtn = renewalCard.locator('button:has-text("Wait")');
    if (await waitBtn.first().isVisible().catch(() => false)) {
      const waitText = (await waitBtn.first().innerText().catch(() => "")).trim();
      console.log("Skip: cooldown detected:", waitText || "Wait");
      return;
    }

    // 7) 点击 Renew（按钮可能是 “Renew +12 hours” 或 “Renew”）
    const renewBtn = renewalCard.locator('button:has-text("Renew")');
    if (!(await renewBtn.first().isVisible().catch(() => false))) {
      console.log("Skip: Renew button not visible.");
      return;
    }

    await renewBtn.first().click();
    console.log("✅ Renew clicked.");

    // 8) 点击后通常会变成 Wait xx min，做一次确认（不强制）
    await page.waitForTimeout(1500);
    if (await waitBtn.first().isVisible().catch(() => false)) {
      const waitTextAfter = (await waitBtn.first().innerText().catch(() => "")).trim();
      console.log("After click:", waitTextAfter || "Wait visible");
    } else {
      console.log("After click: Wait not detected (UI may differ, but click executed).");
    }
  } catch (e) {
    console.error("❌ Run failed:", e);
    process.exit(10);
  } finally {
    await browser.close();
  }
}

main();
