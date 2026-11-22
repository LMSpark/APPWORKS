状态：blocked

## 阻断原因

代码实现及 112 项定向回归、typecheck、lint、docs、page-thin 与 diff-check 均已通过。原 SPA/Vite 在实施期间退出，Page06 原 in-memory attempt 已失去；新 owner 确认远端 `style.css` 与仓内单行注释 bytes 相同，且 cfg 导航路径可打开，但当前新 owner 的 `VersionId` 写权限检查为 false，`保存三个交付文件` disabled。新 owner 运行页 route identity 为 Page06 node/D3 scenario，但 main renderer 为空，未取得 publication receipt/render proof。未继续 Page07-19，未修改/部署后端。

## 任务目标

为 PageTool working file 的非 AjaxResult/502 unknown 提供正式、可审计、用户显式的“原 attempt 只读核验 + 同 target/同 bytes 补偿重试”恢复链，解除 Page06 style 阻断且不开放快照、manifest、新增或删除的重复提交。

## 阶段与业务语义

- 输入是同一 DataView 持有的原 working-file update attempt、原基线、原 text、原 target 和明确的用户恢复动作。
- 只读核验先读取远端；精确匹配原 text 即确认并交付原回执，远端变化为第三态时仍 unknown。
- 仅当远端仍匹配原 update 基线，且来源声明该 working replacement 支持同内容幂等补偿时，用户可显式派发一次同 target/同 text 写入。
- 补偿后的回读必须精确匹配原 text；网络失败仍保留 original attempt，不自动循环、不切换 pageId、不替换 owner。
- create/delete、历史快照、pagedata、manifest 及任意 `isReplace=false` 写入没有该补偿入口。
- Page06 style 通过该链恢复后，继续原发布断点创建/核验快照、manifest、VersionId 与当前 SPA 导航。

## 影响范围

- `packages/spark-data/src/query/data-view-source.ts`：扩展正文 attempt 状态/显式补偿动作合同。
- `packages/spark-data/src/query/file-resource-adapter.ts`：保存原 update 捕获，核验并在显式动作下执行同目标同正文补偿。
- `packages/spark-data/src/data-view.ts`：暴露正式 `retrySourceWriteAttempt` DataView API。
- `src/services/project/page-tool-file-dataview.ts`：PageTool working file 声明可补偿能力；快照/manifest 不声明。
- `packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts`：保留 unknown 502；明确 AjaxResult 拒绝不再被 outer catch 错标 unknown。
- `src/views/features/application/application-function-management/ui/page-design/useDevFileEditor.ts`、`ui/page-design/DevFileEditor.vue`：展示“核验原提交”与单独的“同内容补偿重试”，不合并为一个隐藏写操作。
- 对应 spark-data、spark-lowcode-api 测试。
- `notes/data-space-retirement-ledger.md`、`notes/ai-code-metrics.md`：记录 Page06 恢复及测试结果。

## 技术方案

1. 先扩充 FileResourceTransport 的可选窄能力，参数只接受原 target、原 baseline、原 text；能力缺失时不能补偿。
2. 在 FileResourceAdapter 保存 original update attempt 时，保留可补偿语义；`verifyWriteAttempt` 仍只读并返回“原基线/未知第三态/已确认”诊断。
3. 新增 `retryWriteAttempt`：只允许 pending write update、transport 明确支持补偿、原 target 仍锁定、当前远端仍与原 baseline 精确匹配；随后使用原 transport write 执行同一 bytes，精确回读后确认 projection。
4. DataView/DataViewSource 只转发该正式动作并维持生命周期/identity guard；不直接暴露底层 transport。
5. PageTool FileResource transport 只为普通 `versionId === ''` 的工作文件提供补偿能力；release/manifest view、create/delete/history 不提供。
6. 修正 upload explicit rejection 分类：只有 request dispatched 后的非 Ajax/transport/readback/identity failure 标记 may-applied；可信 `Code !== 200` 保持 definite rejection。
7. 页面工具编辑器显示独立补偿按钮；只有核验结果明确证明仍为原基线时启用。每次点击最多一次，失败后按钮继续保留，不自动循环。
8. 用单元测试覆盖 Page06 式 update unknown+baseline+显式补偿；严格断言 baseline 第三态不重试、create/delete/snapshot 不重试、失败不替换原 attempt、补偿成功只写一次。
9. 通过测试后在当前 SPA 对 Page06 原 owner 执行只读核验，再用户显式同内容补偿，核工作文件、版本、manifest 与运行导航。

## 兼容性

- 默认现有保存/核验行为不变；未声明补偿能力的资源无额外按钮或重试。
- `verifyWriteAttempt` 继续为只读，禁止兼容层偷偷写入。
- 只在 `isReplace=true` 的已存在 working update 上开放；工作文件 create 仍不补偿。
- Lowcode history、pagedata、manifest 和二进制资源现有结果 unknown 语义不变。
- 正式 TypeScript 类型不使用断言绕过；公共导出仅增加明确消费者需要的 DataView 方法/状态。

## 验证计划

- 编译基线：实施前运行 `pnpm run typecheck`。
- 定向测试：spark-data FileResource adapter、DataSet save journal、DataView source lifecycle。
- 定向测试：spark-lowcode-api upload explicit rejection、502/non-Ajax unknown、V2/V1 fallback。
- 定向测试：PageTool 文件恢复与 useDevFileEditor 交互。
- `pnpm run verify:page-thin`、`pnpm run verify:docs`、`git diff --check`。
- 当前 SPA Page06 原 owner：核验仍为基线 → 显式补偿一次 → 工作文件 hash/readback → 发布快照/manifest/VersionId → 页面运行导航打开，禁止 cold reload。

## 风险项

- 同目标同 bytes 仍是补偿语义，不等于服务端幂等键；只有原 working replacement、远端已核为原基线且用户显式触发时可用。
- 原 502 请求可能延迟到达；同 text 终态收敛，但网络请求次数与时间戳可能增加，验收只承诺最终 exact bytes。
- 若补偿请求也返回 unknown，Page06 保持 blocked，不能再自动重试；必须再次只读核验。
- 当前 owner 如果因 SPA/HMR 销毁，原 in-memory attempt 可能丢失；实施与在线恢复必须在同一当前实例完成，不能制造 replacement owner。
