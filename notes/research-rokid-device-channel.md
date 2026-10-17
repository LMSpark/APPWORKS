# Rokid AIUI 设备通道研读锚点

## 外部事实（公开文档，未登录实测）
- https://aiui.rokid.com/ 重定向至 Rokid 账户中心登录；Studio 工作台内容未验证。
- 公开文档：https://js.rokid.com/AIUI ；开源仓：https://github.com/yodaos-project/AIUI 。
- AIUI 运行时为 Ink/QuickJS + WXML/WXSS 或 `.ink`，交付物 AIX；与本仓 Vue + PageRuntime + spark-data 无共享合同。
- 服务端包 `@yodaos-pkg/cloud-integration`（Node ≥20）：
  - `sendNotification`：`POST https://rcs.rokid.com/metis/callback/message`，Bearer `ROKID_SK`；可带 `tool.name`（AIUI app.json 页面路径）。
  - `saveTemporaryMessage`：`POST {AIUI_ENDPOINT}/metis/openApi/v1/cacheAIUIMessage`，头 `access_token`；10 分钟、同 agentId 覆盖写。
  - `getToken`：仅系统智能体，非第三方可用。
  - `AIUI_ENDPOINT` 无统一公共 host，须由部署环境提供。
- 账号授权：Studio 声明权限 → Rokid AI App 授权 → 服务端 `checkAccountCode`（developerSk）。
- 设备内 `createOpenAPI('open')` 仅在智能体 JS 中可用，凭据由宿主注入。

## 本仓事实
- 仓内无 rokid/aiui 引用。
- 现有 AI 链 `src/services/ai/ai-turn-bridge.ts` → `LowcodeRealtimeApi`（`/api/ai/turns`）属页面设计 Agent，不作为眼镜通道。
- 当前主任务 E62 数据空间设计整页恢复；本通道不得写入 pagedata、设计会话或 spark-data。
- 后端为实际运行服务，不改本地 Java。

## 待核实
- Studio 中 SK、AIUI_ENDPOINT、agentId 获取路径与权限声明。
- 通知真实回执结构与失败码。
- 商店分发地区与审核要求。
