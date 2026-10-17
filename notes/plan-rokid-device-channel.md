状态：superseded（2026-10-17 用户决定不依赖 Rokid 第三方账号，改为自建推送；替代方案待研读后另立台账。`packages/spark-rokid-channel` 暂保留，去留随替代方案决定）

# Rokid AIUI 设备通道实施台账

独立于 `notes/plan-data-space-metadata-dataset.md`（E62），未改动数据空间主链、spark-data、pageDesign 或 Java。

## 用户裁定（2026-10-17，"全部按推荐"）
- 无 Rokid 账号时先按公开文档编写侧车，mock fetch 测试，明确标注未经真实服务验证。
- AIX 眼镜智能体放仓外独立仓库，本仓不含眼镜端代码。

## 实际改动
- 新包 `packages/spark-rokid-channel`（private，无运行时依赖，Node ≥20 fetch 可注入）：
  - `http/rokid-http.ts` `RokidHttp`：结果分 succeeded（code===1）/ failed（HTTP 错误或业务码）/ unknown（超时、网络、不可解析的 200）。
  - `notification/rokid-notification-client.ts` `RokidNotificationClient`：`POST rcs.rokid.com/metis/callback/message`，Bearer SK；校验 `data.success`；同一 messageId 已成功或未知时不重发，仅明确失败可重试。
  - `account/rokid-account-binding.ts` `RokidAccountBinding`：`checkAccountCode` 请求体 accountId/code/developerSk，`data.checkResult===true` 才绑定；未知结果不绑定；已绑定他人则拒绝且不调用 Rokid。持久化通过 `RokidAccountBindingStore` 注入。
  - `gateway/rokid-channel-gateway.ts` `RokidChannelGateway`：注册 query/command 窄操作；未绑定或未注册操作拒绝；handler 只收到绑定解析出的 sparkUserId；command 抛错报 unknown，query 抛错报 failed。
- 根 `eslint.config.js` parserOptions.project 加入该包 tsconfig。

## 验证
- 包内 `typecheck`、`lint`、`test:run` 12/12 通过（mock fetch）。
- 未执行：真实 Rokid 通知/校验调用、眼镜端收件与深链、真机或模拟器。

## 未闭合段
| 阶段 | 状态 | 缺口 |
| --- | --- | --- |
| Phase 0 账号实测 | blocked | 需用户登录 AIUI Studio 提供 ROKID_SK、developerSk、agentId、测试 accountId |
| Phase 1 通知 PoC | 侧车完成 | 触发事件未接线：后端为实际运行服务、不改 Java，需确定由哪个已有业务事件、何处调用侧车；仓外 AIX 收件页未建 |
| Phase 2 绑定 + 只读 | 侧车完成 | 绑定存储生产实现与 SPARK 用户会话来源未定；具体只读 DTO 操作未注册 |
| Phase 3 窄命令 | 机制完成 | 无产品批准的写操作，未注册任何 command |
| 侧车部署 | 未做 | HTTP 宿主/进程形态、密钥注入方式未定 |

## Phase 0 实测脚本
`packages/spark-rokid-channel/src/probe/rokid-phase0-probe.ts`，运行 `pnpm --filter @spark-appworks/spark-rokid-channel probe:phase0`。环境变量：必填 ROKID_SK、ROKID_AGENT_ID、ROKID_ACCOUNT_ID；可选 ROKID_DEVELOPER_SK + ROKID_ACCOUNT_CODE。输出不含密钥与校验码，accountId 掩码；账号校验不写持久绑定。已验证缺变量时明确报错退出；尚未有真实输出。

## 下一动作
用户提供 Rokid 凭据后，用真实 SK 对测试 accountId 发一次通知并记录脱敏回执；同时确认触发事件与绑定存储归属。
