# GreatHost Renew Dashboard (Railway Web + Playwright)

一个可部署到 Railway 的 Web 服务：  
- 定时登录 GreatHost  
- 打开合同页读取 **Accumulated time**（累计小时）  
- 当满足条件时自动点击 **Renew**  
- Railway 会分配域名，用网页实时查看：剩余小时数 / 在线状态 / 最近日志

---

## 功能

- ✅ Web 看板：显示在线状态、累计小时、剩余小时、上次/下次检查时间、最近动作、最近日志
- ✅ 定时任务：按 `CHECK_EVERY_HOURS` 周期自动检查
- ✅ 规则：
  - 当 **Accumulated hours >= SKIP_IF_GE_HOURS（默认 100）** → 不点 Renew
  - 当按钮处于冷却（显示 `Wait xx min`）→ 不点 Renew
  - 其余情况 → 点击 `Renew`
- ✅ 手动触发：网页上点 `Run Now` 或 `POST /run`

---

## 目录结构
.
├─ package.json
└─ server.js

---

## 环境变量

### 必填

| 变量名 | 说明 | 示例 |
|---|---|---|
| `LOGIN_URL` | 登录页 URL | `https://greathost.es/login` |
| `PANEL_URL` | 合同详情页 URL（含 Renewal Information / Renew 按钮） | `https://greathost.es/contracts/<contract_id>` |
| `USERNAME` | 登录邮箱/用户名 | `you@example.com` |
| `PASSWORD` | 登录密码 | `your_password` |

### 推荐

| 变量名 | 默认值 | 说明 |
|---|---:|---|
| `CHECK_EVERY_HOURS` | `3` | 每隔几小时检查一次（建议 3 或 6） |
| `SKIP_IF_GE_HOURS` | `100` | 累计小时 >= 该值时跳过 Renew |
| `MAX_HOURS` | `120` | 上限（GreatHost 通常是 120h） |

### 可选（排错/兼容）

| 变量名 | 默认值 | 说明 |
|---|---:|---|
| `HEADLESS` | `true` | `false` 时本地可看到浏览器（Railway 建议 true） |
| `TIMEOUT_MS` | `30000` | 页面等待超时（毫秒） |
| `PORT` | `3000` | 监听端口（Railway 一般会自动注入） |

---

## 本地运行

需要 Node.js 18+（建议 18/20）。

```bash
npm install

export LOGIN_URL="https://greathost.es/login"
export PANEL_URL="https://greathost.es/contracts/<contract_id>"
export USERNAME="xxx"
export PASSWORD="yyy"

# 可选
export CHECK_EVERY_HOURS="3"
export SKIP_IF_GE_HOURS="100"
export MAX_HOURS="120"

npm start
启动后访问：

http://localhost:3000/
 （网页看板）

http://localhost:3000/status
 （JSON 状态）
Railway 部署
1) 新建项目并连接 GitHub Repo

把代码推到 GitHub，然后在 Railway 创建新项目并连接仓库。

2) 配置环境变量

在 Railway -> Variables 中添加：

LOGIN_URL

PANEL_URL

USERNAME

PASSWORD

（推荐）CHECK_EVERY_HOURS、SKIP_IF_GE_HOURS、MAX_HOURS

3) 运行方式

这是 Web Service（常驻），不需要 Cron Job。

Start Command：npm start

部署成功后，Railway 会提供域名，直接访问：

/：看板

/status：JSON

点击 Run Now 可立即触发一次检查/续期

API

GET /
Web 看板

GET /status
JSON 状态（可用于外部监控/探针）

POST /run
手动触发一次检查（返回 { ok: true }，任务异步执行）
