# 自建通知通道研读（SSE 通知 + 桌面弹窗 + 离线消息）

来源：本地参考仓 `E:\lowcode-jdk17`（只读，不等于线上服务已同样实现）与本仓前端源码。线上实测尚未执行。

## 后端事实（源码推断）
- 连接：`GET /api/sse/connect?scope=`（`SseController`），先发 `event=connected`，data 含 connectionUid。
- 推送：`AbstractSseMessageSender.doSend` 用 `SseEmitter.event().data(JSON)` 发送，**不设事件名**；data 是整个 `JsonSseMessage`：rowId、entId、entShortName、senderId、receiverType、receiverId、title、content、messageType、sendMethods、createTime。
- messageType 为枚举名，Jackson 默认序列化为 `SYSTEM_NOTIFICATION` 等（前端 `decodeSystemDownload` 已按 `'SYSTEM_DOWNLOAD'` 匹配，佐证）。
- SSE 模块 persistent：USER_MESSAGE、SYSTEM_DOWNLOAD、SYSTEM_KICKOUT 为 true；TIP、ACKNOWLEDGMENT、SYSTEM_NOTIFICATION、SYSTEM_ERROR、AI 为 false。只有 persistent 消息在发送前写 BASE_MESSAGE_INFO 与 BASE_MESSAGE_SEND_LOG 并补 rowId。
- 实际发送方：登录踢出（SYSTEM_KICKOUT）、文档生成提示（TIP）、文档下载（SYSTEM_DOWNLOAD）、文档失败（SYSTEM_ERROR）、SAP Agent 企业通知（SYSTEM_NOTIFICATION）、竞价/AI 流（AI）。标题都是中文业务文案，content 多为纯文本，下载为 JSON。
- `POST /api/message/SendMessage`：任意构造 JsonSseMessage 发送。
- `POST /api/message/offlineMessages`：请求 `[{entShortName,userId}]`，查 status=0、send_method=SSE 的发送日志，连接消息定义；t1.rowId 别名 messageLogId，t2 字段含同名 rowId，联表后键名冲突的实际结果未知。
- `POST /api/message/confirmMessages?entShortName=`：body 为 **messageLogId** 列表（发送日志 rowId），不是消息 rowId。实时帧只带消息 rowId，因此实时消息无法直接确认；只能确认离线查询返回的条目。
- offlineMessages 按请求体里的 userId 查询，源码未见与当前登录用户比对；前端只能传当前用户自身身份，不能据此推断后端已做隔离。

## 前端现状与差距
- `src/services/sse-events.ts` 按 envelope 名 → `message.title` → SSE 事件名决定 eventType；`onNotificationEvent` 只订阅 `notification`，且要求 content 解析出带 `message` 字段的对象。
- 后端没有任何发送方使用 title=`notification`，因此通知面板（`src/composables/useNotifications.ts` → `AppHeader.vue`）**收不到任何真实后端消息**。
- 上一轮已在 useNotifications 加入桌面弹窗与授权按钮，但依赖同一条不会触发的订阅。

## 待线上核实
- 实际帧中 messageType、createTime 的序列化形式。
- offlineMessages 返回的键名（messageLogId 与 rowId 是否冲突覆盖）。
- 当前登录用户的 entShortName 与用户 rowId 在前端从哪里取得。
