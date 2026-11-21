状态：superseded（替代方案：`plan-smart-bid-c1-navigation.md`）

## 阻断原因

本计划按“页面未建”判断阻断，已被用户纠正。当前源码和授权 SPA 证明三类原生页面已经存在，缺的是蓝图导航接线。业务页面合同是否逐项等同标书正式方案另由后续语义验收，不在本次导航接线里预设完成或缺失。

## 任务目标

以当前 `main` / `bffc372e0` 为基线，按 SmartBid C1 平台共同底座合同梳理并收敛页01企业服务、页02公共能力发布、页03服务与未决办理的正式 owner、数据链、测试和可实施缺口；只实现已有正式合同能证明的切片，不伪造服务能力或第二数据入口。

## 阶段与业务语义

- 本阶段完整交付是 C1 的三份“源码事实 -> 正式资源 -> owner/命令 -> 测试 -> 实服边界 -> 清理裁决”闭环，不以 19 页源码数量或 smoke 通过代替业务完成。
- 页01输入为企业身份、服务约定、状态意图、有效时点和退出接手人；输出为可回读的服务决定/退出记录及下游状态。
- 页02输入为来源版本、分发许可、目标企业、有效范围和变更意图；输出为发布/调整/撤下事件及可回查的原指针。
- 页03输入为原操作、故障范围、最后可证步骤、当前权限和接手人；输出为受影响队列、原结果查询、恢复范围和责任移交。
- 每个缺口都必须归入可复用、公共缺口、正式服务缺口、数据模型缺口或实施项之一；服务缺口不得由页面状态或夹具补齐。
- 每组修改后同步删除被替代的页面逻辑、旧 reader/host、失效测试和过程产物；不可删除的历史、原请求或正式记录登记留存理由。

## 影响范围

### C1 合同与台账

- `docs/smart-bid/delivery/pages-scenarios.md`：仅在当前源码合同被实现或证伪时修订 C1 交接说明；不改变正式业务方案。
- `notes/data-space-retirement-ledger.md`：记录当前 HEAD、页01-03逐函数事实、阻断、实服结果与精确清理。
- `notes/research-smart-bid-current-state.md`：研读锚点，仅因现状发现变更时更新。

### 页01企业服务

- `src/views/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue`
- `src/views/features/application/enterprise-regist-manager/ui/*.vue`
- `src/lowcode/resources/system/enterprise-registration/runtime-bindings.ts`
- `packages/spark-lowcode-api/src/platform/resources/system/enterprise-initialization-resource.ts`
- `packages/spark-lowcode-api/src/platform/resources/system/tests/enterprise-initialization.test.ts`
- 相关企业入驻、审核、授权、配置测试。

### 页02公共能力发布

- `src/views/features/application/enterprise-app-auth-application/**`
- `src/services/project/page-tool-publication.ts`
- `src/services/project/blueprint-workspace-dataview.ts`
- `src/views/features/application/application-function-management/ui/page-design/**`
- 对应发布、应用授权、蓝图、精确回读与 unknown 测试。

### 页03服务与未决办理

- `src/views/features/system/data-recovery/**`
- `src/services/smart-bid/operation/operation-route-recovery.ts`
- `src/services/smart-bid/content/**/recovery*.ts`
- `src/views/features/application/smart-bid/**/reader.ts`
- 对应原请求、unknown、恢复、移交和当前权限测试。

### 公共边界

- `packages/spark-component/src/page/actions/**`、`packages/spark-project-model/src/page/**` 仅在 C1 定向反例证明标准动作/PageTool 合同直接阻断时纳入。
- `generated/dts-class-model/**` 仅由正式生成器刷新，不手改。
- `smartbid-test-results.json` 等一次性结果文件若重新出现，确认无引用后删除；正式验证日志不依赖它。

## 技术方案

1. 开工检查：确认 `main`、工作树清洁、无额外 worktree、无 lock 冲突，记录 `pnpm run typecheck` 基线。
2. 冻结当前 C1 函数清单：
   - 页01：登记服务决定、登记退出交接；
   - 页02：登记公共发布；
   - 页03：登记运行中断、查询原办理、核恢复条件。
3. 逐函数建立四类证据：
   - 正式 DataTable/DataView/字段/权限；
   - owner、命令或只读查询契约；
   - 当前 UI/host/reader 消费；
   - 原结果、unknown、并发和冷重开。
4. 对页01先核现有入驻场景能否仅通过新增正式命名视图或命令资源承接服务决定，不把初始化命令扩写为生命周期命令。
5. 对页02先区分三项现有合同：
   - 跨企业应用授权申请/审批；
   - PageTool 三文件 publication；
   - 公共能力来源许可/范围/撤下。
   只合并有相同 owner 和结果语义的部分，不能把应用授权改装为公共发布。
6. 对页03先盘点所有已有原请求 owner 的共同最小合同，只有明确可共享时抽为公共查询/移交接口；不可共享的业务结果仍由原 owner 出具。
7. 只实施已证实正式合同的 C1 切片：
   - 组件绑定正式视图；
   - 命令经原 DataSet/DataView 保存或命令 owner；
   - 结果由原请求键和 receipt 核验；
   - 明确失败允许按原 owner 撤销本地草稿，unknown 仅保留并续查。
8. 对需要新增后端模型、字段、视图、权限、命令或外部发布协议的项，停止该切片并标 `blocked-service`；先与真实服务核证，不修改 Java。
9. 已实现切片同步删除被替代的旧 host、reader、页面状态、重复请求和对应旧测试；旧入口仅允许在本轮内读取在途原请求，结束前删除。
10. 使用隔离的 C1 smoke 记录验证正常写入、明确失败、unknown、冷重开和删除；逐项核回执与精确不存在，保留不可删除的正式历史及原因。

## 兼容性

- 不处理旧 SmartBid 84A 应用，不复用其模型、pagedata、蓝图或凭据。
- SmartBid 页面保持当前三文件公共合同；16 个空 `script.js` 不在本计划中删除。
- 对其他平台页面不得要求 SmartBid 专用业务字段或权限。
- C1 可以复用平台页面和 owner，但不得把平台宿主逻辑复制回 SmartBid 页面。
- 本轮允许旧入口仅供在途原请求回读；同一 owner 完成新合同验证后删除旧入口。

## 验证计划

- 开工基线：`git status --short --branch`、`pnpm run typecheck`。
- 当前 smoke：`pnpm exec vitest run` 指定的 SmartBid 4 文件，基线 33/33。
- C1 定向：页01企业入驻、页02应用授权/发布、页03恢复/原请求相关测试，按实际影响文件组合。
- 类型检查：`pnpm run typecheck`。
- Lint：先运行本次改动文件定向 ESLint，再运行 `pnpm run lint`。
- 规则：`pnpm run verify:pages-config`、`pnpm run verify:project-blueprint-ssot`、`pnpm run verify:ai-codegen`、`pnpm run verify:page-thin`；可用时跑完整 `pnpm run verify:rules`。
- ClassModel：仅当公共 class/JSDoc 或 SmartBid 模型公开成员变化时，运行 `pnpm run generate:class-model-surface` 与 `pnpm run verify:class-model`。
- 构建：`pnpm run build`。
- 真实验证：只读冷装配加明确隔离的 C1 写入；逐笔核正式回执、原请求查询、冷重开和精确清理。无服务权限或合同时只记录 blocker。
- 收口前 `git diff --check`，确认仅本批白名单文件、无缓存/日志/临时目录、无额外 worktree。

## 风险项

- C1 三页主要由平台宿主承接，SmartBid 仓内页面和平台业务合同可能错位；必须先核 owner 归属，不能把页面路由数当契约数量。
- 页02的 PageTool publication、应用授权和公共能力分发形态相近但业务 owner 不同，错误合并会丢来源许可或撤下范围。
- 页03若强行统一所有业务 unknown，会破坏原 owner 的精确请求身份和权限；应只抽公共查询/移交合同，保留各域结果。
- 当前正式服务可能只支持部分企业初始化或应用授权，缺服务合同将阻断实服闭环；不得修改 Java 或伪造协议。
- 旧结果报告与历史通过记录可能再次被误当现状；所有收口结论以当前 HEAD 重跑和精确回读为准。

