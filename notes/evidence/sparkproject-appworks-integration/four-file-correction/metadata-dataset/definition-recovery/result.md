# 定义变更后的修复、保存和重开

状态：局部行为已验；全局回归未通过，完整 DataSet / AppWorks 目标继续。

## 本轮结果

先红后绿复现并修复两条失败路径：文件绑定与正式定义不一致时不能打开会话；已打开会话刷新失败后不能再提交修复候选。现在文件已成功加载且目标/scope/修订有效时，会话保留元数据与文件草稿，用 `definitionError` 明确提供装配失败原因；读取不可用投影仍抛错，保存未修复文件仍拒绝。修复候选须通过现有正式模型及原生装配验证，成功后清除错误。损坏 JSON、文件读取失败、过期 scope 和 dispose 仍失败并释放资源。

实际变化只有一份生产源与两份测试：
- `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`。
- 新增 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-definition-recovery.test.ts`。

前两份原有脏文件的前像和哈希保留在 before/、before-hashes.json；最终三路径哈希在 final-hashes.json。没有回退已有修改、提交 Git、改变 Java/UI 或重命名 api/crudConfig。主控直接实施并自审，未使用代理。

## 完整样板证据

集成测试使用真实 DataView、DataSpaceRuntimeApi、DataSpaceDesignApi、Assembler、ProjectWorkspace 和设计会话，只替换 HTTP 与文件存储边界。四表元数据入口读目标定义，编辑正式字段 AsName 并经原查询签名保存；正式定义重新读取后，旧 pagedata 的列引用失效；关闭并重开仍可看见元数据和装配错误；无效修复不改草稿，正确修复经文件保存后，新工作区能够按新字段名查询、按数据权限编辑、映射回正式字段签名提交并重新查询。

两种路径均通过：正常文件保存、文件已写但响应丢失。后者通过现有 unknown 核验确认，只发生一次文件写入，不重复元数据保存。新实例中没有持久化 rows 或权限凭据。数据库与文件仍分别确认，无跨源事务；数据库保存后使用显式 refresh。

线上验证是只读边界：在独立探针工作区加载已授权目标，临时加入无效列引用，真实后端正式模型参与装配；新会话明确报错但元数据完整可用，再通过 stageDefinition 恢复原文。结果为 1 空间、7 模型、119 字段、0 关系；恢复后 7 个目标 DataTable 可用。137 次允许的读取，业务/配置写入 0，远端文件前后原文一致，实例已释放。见 online-recovery.mjs / online-result.json。线上没有执行字段改写或业务提交，不能把传输夹具写链称为线上写验收。

## 检查与未通过项

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 根类型，修改前/后 | 通过 | typecheck-before.log / typecheck-after.log |
| 新恢复行为 | 最初 2 项失败，随后会话 22 + 集成 2 通过 | red-behavior.log / recovery-final.log |
| 受影响根套件 | 8 套、147 项通过 | focused.log |
| API runtime/design | 8 套、540 项通过 | api-regression.log |
| 三路径 ESLint | exit 0，空输出 | lint.log |
| AI 规则 | 1019 文件通过 | ai-codegen.log |
| 根全套 | 210 套：208 通过、2 失败；2724 项通过、2 失败 | root-suite.log |
| 两个失败独立重跑 | 20 项通过、同样 2 项失败 | root-failures-recheck.log |

根全套的两个未解决项：
1. `tests/app/dev/dev-dataset-designer-projection.test.ts:4`，`retains independent named views and explicit cascades without editable resource columns`：预期 `columns: []` 被拒绝，但当前配置层接受。这涉及当前正式字段扩展合同，不能只删断言；下一闭环应核对原生字段与数据库字段的边界后修正。
2. `tests/runtime/page/spark-page-renderer-binding.test.ts:814`，`subscribes to views created later and releases subscriptions on same-runtime reload and unmount`：预期订阅 4 次，实际 6 次。需核对刷新时订阅是否及时释放，不能先把次数改成 6。

两处及其直接产品文件均未在本轮修改。独立重跑仍失败；没有进行旧版本对照，故不声称已证明它们全部是既有缺陷，也不声称全局零回归。本轮先保留精确证据，不把范围外修复混入此差分。

返工记录：首个生产补丁使 scope 过期错误被 disposed 错误覆盖，现有测试发现后立即修正，并通过全部会话测试。初次 API 回归日志路径写错，命令未执行，随后以绝对路径重新运行通过。Vite 的 esbuild/oxc 警告与 jsdom requestSubmit 提示原样保留。

候选知识：可修复的设计会话不能依赖被设计产物始终装配成功；必须保留来源编辑对象，显式返回投影失败，并在候选接受/保存时重新验证。仅记于本结果及计划，未写入 knowledge 或个人记忆。
