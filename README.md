# GreatHost Auto Renew Bot (Playwright + Railway Cron)

定时打开 GreatHost 合同详情页，读取 **Accumulated time**，在满足条件时自动点击 **Renew**（+12 hours）。

## 功能
- ✅ 自动登录
- ✅ 打开合同页（Renewal Information 卡片）
- ✅ 读取 `Accumulated time`（小时数）
- ✅ 当累计小时 **>= 阈值（默认 100h）** 时不点击
- ✅ 当按钮处于冷却（显示 `Wait xx min`）时不点击
- ✅ 其余情况点击 `Renew` 按钮

> GreatHost 上限是 120h；建议阈值设为 100h 或更保守（如 108/110）。

---

## 环境变量

### 必填
| 变量名 | 说明 | 示例 |
|---|---|---|
| `LOGIN_URL` | 登录页 URL | `https://greathost.es/login` |
| `PANEL_URL` | 合同详情页 URL（有 Renew 的页面） | `https://greathost.es/contracts/<id>` |
| `USERNAME` | 登录邮箱/用户名 | `your@email.com` |
| `PASSWORD` | 登录密码 | `your_password` |

### 可选
| 变量名 | 默认值 | 说明 |
|---|---:|---|
| `SKIP_IF_GE_HOURS` | `100` | 当累计小时 >= 该值时不点击 Renew |
| `HEADLESS` | `true` | `false` 时可本地看浏览器跑（Railway 建议保持 true） |
| `TIMEOUT_MS` | `30000` | 等待超时（毫秒） |

---

## 本地运行

> 需要 Node.js 18+（建议 18/20）。

```bash
npm install
export LOGIN_URL="https://greathost.es/login"
export PANEL_URL="https://greathost.es/contracts/<id>"
export USERNAME="xxx"
export PASSWORD="yyy"
export SKIP_IF_GE_HOURS="100"
npm start
