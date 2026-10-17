状态：implementing（2026-10-17 用户"继续"视为通过；线上 SendMessage 自测未获明确同意，暂只做本地验证）

## 任务目标
让站内通知面板和桌面弹窗收到后端真实推送的消息，并接入离线消息与已读确认。

## 阶段与业务语义
- 输入：`/api/sse/connect` 推送的 JsonSseMessage；登录后 `offlineMessages` 返回的未确认消息。
- 输出：通知面板条目（标题、内容、时间、级别）；页面在后台且已授权时弹桌面通知；用户标为已读时，对带 messageLogId 的条目调用 `confirmMessages`。
- 识别规则：messageType ∈ {SYSTEM_NOTIFICATION, TIP, SYSTEM_ERROR, USER_MESSAGE} 进入面板；SYSTEM_DOWNLOAD 保持现有下载处理；SYSTEM_KICKOUT、AI、ACKNOWLEDGMENT 不进面板。
- 去重：同一消息 rowId 只保留一条（离线与实时可能重复）。
- 异常：confirmMessages 失败时条目保持未确认并提示，不重放；offlineMessages 失败时面板显示加载失败，不当作"无消息"。

## 影响范围
- `src/services/sse-events.ts`：在原始帧层按 messageType 分发通知，删除不存在的 `notification` 标题路由与旧归一化。
- `src/composables/useNotifications.ts`：消费新事件、离线拉取、已读确认、rowId 去重；保留上轮桌面弹窗。
- `packages/spark-lowcode-api`：在已有门面上增加 offlineMessages、confirmMessages 两个调用（具体文件研读后确定）。
- `src/layout/AppHeader.vue`：保留上轮授权按钮，补离线加载失败提示。
- 测试：`tests/app/services/sse-events.test.ts` 增补；`tests/app/composables/use-notifications-desktop.test.ts` 改为基于真实帧形状。

## 验证计划
- `pnpm run typecheck`、`pnpm run lint`、相关 vitest。
- 线上：登录开发服务，抓一条真实 SSE 帧和一次 offlineMessages 响应，核对字段后再定稿解析；用 SendMessage 给自己发一条 USER_MESSAGE，验证面板、弹窗、重新登录后离线拉取、已读确认回执。

## 实施结果（2026-10-17）
- `LowcodeRealtimeApi` 新增 `decodeNotification`、`fetchOfflineMessages`、`confirmMessages`，身份取自会话 identity.userId / enterpriseShortName；导出 `LowcodeNotificationMessage`。
- `sse-events.ts` 先按 messageType 分流通知，删除 `notification` 标题路由、`ServerNotificationEvent` 与旧归一化。
- `useNotifications.ts` 消费新消息、rowId 去重、连接时拉离线、已读回写 messageLogId（失败恢复未读、不重试）、离线失败可重试；保留桌面弹窗。
- `AppHeader.vue` 显示同步错误与重试、离线加载中状态。
- 验证：根 typecheck 通过；改动文件 eslint 通过；vitest 应用侧 12/12、spark-lowcode-api realtime 10/10。
- 未做：线上抓包核对帧字段与 offlineMessages 键名；SendMessage 线上自测（未获同意）；真实浏览器中桌面弹窗人工验证。

## 风险项
- 线上服务与本地 Java 源码可能不一致：以抓包结果为准。
- 实时消息无 messageLogId，无法单独确认：只确认离线条目，实时条目仅本地已读。
- 用 SendMessage 自测会在线上写入消息记录：需你同意后执行。
