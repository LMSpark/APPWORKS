# A3.3 来源替换与字段同步验收

日期：2026-10-24。基线：`92dcc18b1ba3781e8b759cf9f14e76a5a3268a96`。本组属于唯一台账阶段 A，未宣称阶段 A 或整个平台完成。

## 实现范围

来源替换和绑定来源同步保留原领域校验、映射与引用迁移，改用既有 `DataSpaceDefinitionSave` 和原 DataView 捕获核验；删除此 owner 的全 DataSet abandon 及重复回执算法。未知、部分成功和坏回执不能采用当前结果结束，也不能重放数据库批次。原生完整回执、领域回读、文件配置完成分别确认。

默认核验保留本地修改。权威未生效的原意图放弃和已确认批次后新修改的丢弃均为明确操作，且仅处理原捕获目标。全部目标先核身份、上下文和忙碌状态，再同步丢弃。无变更的字段同步不生成虚假数据库回执或文件写入。

页面继续使用标准 RendererForm/Table/Button/Dialog 及 DataView 绑定。控件与工具栏依据此前正式生成的 ClassModel 目录、概要和成员指南；本组生成器再次刷新来源 owner 的恢复选项和状态投影，未手改派生产物。

## 真实页面烟测

从原目录导航进入 NewApp 的 T 空间，打开 `SourceScope_20261018`。选择已有 `ContentType` 字典只进入替换预览；八个来源字段及已有计算字段保留说明可见。取消后打开来源字段同步预览，显示新增 0、删除 0，再取消。

关闭模型配置及整个设计器，再由目录开启新实例，确认注册名、ContentType 字典来源及说明“来源替换后连续保存已验证 20261018”保持原值；保存禁用，关闭配置可用。最终返回原目录。

本次 **0 次 UI 持久化动作**，不代表 HTTP 请求计数。实际来源变更、改名和最终删除的持久闭环留在一次性模型联合验收，未知回执故障仅由自动化反例验证。

- [烟测摘要](a3-3-smoke.json)
- [来源预览](a3-3-source-preview.png)
- [新实例原值](a3-3-source-reopened.png)

## 验证及证据边界

最终完整 source-edit **188/188**、直接相关 UI **5/5** 通过（UI 文件另外 344 项未跑）。初审要求补齐权威 not-applied、confirmed 显式丢弃成功，以及坏回执与捕获身份变化三组证据；R1 新增 10 项，R2 再补原捕获字段在显式丢弃后的领域等待期间被再次编辑的 overlay/applied 两种情况。这 12 项均为既有保护，包含在 188 项内，不另行叠加。两轮只改测试，生产/UI/helper/fixture 未改，因此 UI 的原冻结结果继续有效。

最终命令为 `pnpm exec vitest run tests/runtime/page/design/native/data-space-model-source-edit.test.ts --reporter=verbose`，原始输出 `a3-3-r2-source-suite-final.log`；UI 定向命令与原始输出见 `task-a3-3-report.md` / `a3-3-ui.log`。R2 最终 typecheck、测试文件 ESLint 均退出 0；R1 verify:ai-codegen 也为 0，R2 未改产品文件。早期测试 setup/断言错误及类型失败日志保留，不当作生产缺陷。

独立复审在 R2 给出 Spec / Task quality Approved，三项原证据缺口全部解决，0 open；报告 `task-a3-3-r2-review.md`。原生保存/原捕获核验代码未因补证而再次修改，主控核对冻结文件 SHA256 一致。文档门禁检查 398 个文件通过，diff check 通过。

主控正式 `pnpm run generate:class-model-surface` 生成 963 个声明文件；`pnpm run lint`、`pnpm run verify:rules`、`pnpm run build:fe` 均退出 0。规则保留两项既有 AI model warning，构建保留依赖注释和动态导入警告，不宣称零警告。命令原始日志及 exit sidecar 位于 `node_modules/.cache/metadata-integration-20261024/a3-3-*`。

初轮生产编辑前红灯日志未留存。经主控限定仅临时替换一个 session 文件，按 SHA256 核对恢复后进行了 92dcc18b1 事后基线复现，三项行为失败日志见 `task-a3-3-red.log`。这是事后基线证据，不伪称预先留存。文件等待用例在旧实现也保留晚到草稿并拒绝完成，归为已有保护；最初单纯错误文案差异不算缺陷证据。

实施报告、评审及修复轮原始日志均在同一 cache；无 Java、参考仓、权限专题或后端协议变更。本地真实 DataSet/DataView 测试与页面挂载不替代真实服务持久闭环、双空间组件绑定、未加载保存保护及跨刷新/重登录恢复验收。
