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
