# D03 六类来源新增模型：本地实施结果

范围依据：已执行的六来源新增子计划（按阶段 7 删除），完整页仍由 `notes/plan-appworks-four-file-integration.md` 管理。本批没有在线写入、发布、commit、push 或新分支。在线已登录空间仍加载旧四文件，故下述创建结果仅是本地正式 DataView/DataSet 合同夹具与真实 Renderer DOM 验收，不宣称在线页面已具入口。

## 结果

- 现有 `dataSpaceDesign.createReader` 增加可选 `modelSources`，六类固定来源经正式 `runtime.query` 列表、`rowid eq` 身份复核、字段/参数读取及 `readFieldAccess` 权限核验；接口 `ProviderID` 不可读会拒绝，参数 `parzdtype` 缺值按参考默认 `varchar`，隐藏/脱敏会拒绝；字段 `IsPKey` 支持已证布尔及 0/1。
- 四文件模型页通过配置控件选择、筛选、分页、预览和取消；确认后分别由模型与字段 DataView `addRow` 分配 ID，明确两命名视图由一次 `DataSet.saveChanges({views})` 派发。逐视图核回执、完整正式回读、原布局精确写入并重开；零输出字段允许参数或空字段集。命名冲突生成可读唯一注册名，不改来源名。
- 本地草稿保留 input/staging/dispatched/metadata-confirmed 阶段。保存中及回读中中止原脚本上下文后，在同 Runtime 挂载真实 Renderer 继续核验原请求，不重发；该用例不是浏览器卸载测试。未派发清理先核同模型所有 pending 字段均与候选匹配，再按字段、模型顺序丢弃并重载正式数据；已提交结果不作自动补偿。布局缺失时保留 metadata-confirmed，显式接受已回读正式结果后原布局创建入口可用。
- 源操作与原参数、模型、字段、关系、布局编辑互斥。原页面其他路径未改保存 owner。

## 本轮修改文件

生产：`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts`（新增）、`src/lowcode/data-space/lowcode-data-space-design.ts`、`packages/spark-component/src/runtime/app-services.ts`、`packages/spark-component/src/runtime/script-context-types.ts`、`packages/spark-component/src/page/context/buildPageContext.ts`、`packages/spark-component/API.md`、`config/pages/data-platform/data-space-design/rule.json`、`config/pages/data-platform/data-space-design/script.js`。

测试：`tests/runtime/auth-nav/data-space/model-source/lowcode-data-space-model-source-reader.test.ts`（新增）、`tests/runtime/page/design/data-space-design-four-file.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/page/catalog/data-space-four-file.test.ts`。`style.css`、`pagedata.json`、图组件、DataView/DataSet、App/Renderer 未改。

改动前八个文件的 SHA256 与最终所有文件 SHA256 在 [`model-source-create-manifest.json`](model-source-create-manifest.json)。本次开始时只记录了八个原文件 hash，未保留其原始字节副本；其余两个已有测试文件没有可核对的本批改前 hash，清单用 null 明示。工作树已有大量其他未提交改动，不能把当前 Git diff 视为本批纯增量。

## 最终集中验证

| 动作 | 实际命令/配置 | 结果与原始日志 |
| --- | --- | --- |
| 类型 | `pnpm run typecheck` | exit 0；[`model-source-typecheck.log`](model-source-typecheck.log) |
| 精确 lint | `pnpm exec eslint` + 本批 9 个 TS 文件 | exit 0；[`model-source-eslint.log`](model-source-eslint.log) |
| Reader、四文件设计页、脚本生命周期、目录 | `pnpm exec vitest run` 四文件 `--config vitest.config.ts` | 4 文件、197 测试通过，exit 0；[`model-source-root-tests.log`](model-source-root-tests.log) |
| sandbox | `pnpm exec vitest run src/tests/runtime/createSandbox.test.ts --config vitest.config.ts`，工作目录 `packages/spark-component` | 25 测试通过，exit 0；[`model-source-sandbox-tests.log`](model-source-sandbox-tests.log) |

测试覆盖六类来源投影、权限/身份/失效、真实 DOM 选择取消零写与创建后新 Runtime 重开、迟到查询、双击、两次重挂载恢复、双表部分回执、未派发 pending 字段并发修改保护、清理后再次确认、metadata 成功但布局缺失。`jsdom` 的 `requestSubmit()` 提示出现在根测试原始日志内，未造成失败。

## 已知边界与后续

主控限定本地验收通过（2026-10-08）：读取最终 Reader、业务保存/恢复链和新增关键测试，核对 12 文件最终 hash 与原始检查日志；pages-config、ai-codegen（1005 文件）、dirs 及范围内 git diff 检查均 exit 0，日志为 model-source-root-pages/ai/dirs.log。最后仅将内部 SourceRead.filter 改为必填但允许 undefined，消除可选参数冗余联合；此类型声明无运行行为变化，修改后根类型与单文件 lint 再验 exit 0，见 model-source-root-final-types.log / model-source-root-reader-lint.log，manifest 已更新。未据此重复执行未变化的行为大套。

审查修复包括：不可读来源身份/类型不能作空值默认；异步筛选释放 loading；确认前占用与修订复核；未知 ID 暂存字段唯一核验；恢复入口不依赖失败的正常页面快照；未派发清理后重建以继续编辑。未保留改前字节的证据缺口不能补称完整增量审计，保留结果中的限制，不回退混合工作树。

- 在线旧配置未发布，本批未做在线创建写入。需后续按整体页发布/切换后用已授权账号验在线持久与下游消费。
- 一次 `DataSet.saveChanges` 仅保证前端一次 executor 调用，不证明后端多表事务；部分回执会保留待核验状态。
- 本地恢复记录只在同一 `PageRuntime` 有效，不承诺硬刷新恢复。这个边界已写在方案中。
- 知识候选：原 `readFieldAccess` 对缺值字段可返回 visible，故参数类型缺值默认与隐藏/脱敏拒绝须按权限状态判断；未写 `knowledge/`，待用户确认。
