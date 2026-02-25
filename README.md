# GreatHost Renew Dashboard (Railway + GHCR + Playwright)

一个可部署到 Railway 的 Web 服务：  
- 定时登录 GreatHost  
- 打开合同页读取 **Accumulated time**（累计小时）  
- 满足条件时自动点击 **Renew**（+12 hours）  
- Railway 会分配域名，用网页实时查看：剩余小时数 / 在线状态 / 最近动作 / 日志

本项目使用 **Playwright 官方 Docker 基座镜像**（依赖齐全），并通过 **GitHub Actions 自动构建并推送到 GHCR**，Railway 直接从 GHCR 拉取镜像部署。

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
├─ server.js
├─ Dockerfile
├─ .dockerignore
└─ .github/
└─ workflows/
└─ docker-ghcr.yml


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
| `SKIP_IF_GE_HOURS` | `100` | 累计小时 >= 该值时跳过 Renew（GreatHost 上限通常 120h） |
| `MAX_HOURS` | `120` | 上限小时数，用于计算 Remaining |

### 可选（排错/兼容）

| 变量名 | 默认值 | 说明 |
|---|---:|---|
| `HEADLESS` | `true` | Railway 建议保持 true |
| `TIMEOUT_MS` | `30000` | 页面等待超时（毫秒） |
| `PORT` | `3000` | 监听端口（Railway 通常自动注入） |

---

## Web 页面与 API

- `GET /`  
  Web 看板（自动每 20 秒刷新一次）

- `GET /status`  
  JSON 状态（适合外部监控/探针）

- `POST /run`  
  手动触发一次检查（异步执行，立即返回 `{ ok: true }`）

---

## 使用 GHCR 自动构建镜像

项目已包含 GitHub Actions：`.github/workflows/docker-ghcr.yml`

触发方式：
- push 到 `main` 分支会自动构建并推送镜像
- 或在 GitHub Actions 手动点 `Run workflow`

镜像地址格式：
- `ghcr.io/<GitHub用户名>/<仓库名>:latest`
- `ghcr.io/<GitHub用户名>/<仓库名>:sha-xxxxxxx`

---

## Railway 部署（从 GHCR 镜像）

1. 在 Railway 新建 Service → 选择 **Deploy from Image**
2. 填入镜像地址：  
   `ghcr.io/<GitHub用户名>/<仓库名>:latest`
3. 在 Railway 的 Variables 中设置环境变量（至少四个必填）：
   - `LOGIN_URL=https://greathost.es/login`
   - `PANEL_URL=https://greathost.es/contracts/<id>`
   - `USERNAME=...`
   - `PASSWORD=...`
   - （推荐）`CHECK_EVERY_HOURS=3`、`SKIP_IF_GE_HOURS=100`、`MAX_HOURS=120`
4. 部署成功后 Railway 会给你域名，打开：
   - `/` 看板
   - `/status` JSON

### GHCR 拉取权限提示
- 如果你的仓库/镜像是 private，Railway 可能无法拉取。
- 最简单做法：在 GHCR 的包设置里将该 package 设为 **Public**（或仓库保持 public）。

---

## 本地运行（可选）

需要 Docker。

```bash
docker build -t greathost-renew-web:latest .
docker run --rm -p 3000:3000 \
  -e LOGIN_URL="https://greathost.es/login" \
  -e PANEL_URL="https://greathost.es/contracts/<contract_id>" \
  -e USERNAME="xxx" \
  -e PASSWORD="yyy" \
  -e CHECK_EVERY_HOURS="3" \
  -e SKIP_IF_GE_HOURS="100" \
  -e MAX_HOURS="120" \
  greathost-renew-web:latest

访问：

http://localhost:3000/

安全提示

不要把 USERNAME / PASSWORD 写进代码或提交到 GitHub

只通过 Railway Variables / 本地环境变量注入

建议用独立账号，避免主账号风险

常见问题
1) 看板显示 error / hours 为 -

去 /status 查看 lastError 和 lastLog，通常是：

环境变量缺失

登录被重定向回 /login

页面文案/DOM 变化导致定位不到 Renewal Information / Accumulated time

2) 页面 DOM 变化后无法定位

脚本主要依赖右侧卡片文字：

Renewal Information

Accumulated time
如文案变化，需要同步修改 server.js 中对应定位文本。
