状态：superseded（2026-10-21 并入 [plan-appworks-integration.md](plan-appworks-integration.md) v3「调用分类表 · 缺口 1」，以下技术细节仍作实施依据）

## 任务目标
把服务器管理页的「注册服务器」从直接插 `Base_serverInfo` 改为后端注册命令 `POST /api/Db/registerServer`，并按语义接入 spark-data 的 DataSet/DataView 保存链。

## 阶段与业务语义
- **注册（新增）是后端业务命令**：参考页 `ServiceManager.registerServer`；后端（源码参考 `DbInfoController.java:103`）先测连接、拒绝重复连接、按登录上下文写企业所有者、加密密码、响应清空密码；未传 rowid 时后端生成。
- **编辑、删除仍是 `Base_serverInfo` 普通保存**：编辑不含密码；删除按行。
- 输入：Type、ServerName、ip_address、Port、UserName、Password、description；前端生成 rowid 一并提交，用于回读核验。
- 输出：命令回执成功后刷新 `Base_serverInfo@default`，按该 rowid 回读到记录才算成功。
- 失败：业务码非 200 为明确失败（无记录）；传输失败为结果未知，只能按 rowid 回读核验，禁止重放注册。
- 取消：丢弃命令视图的本地输入行，不影响服务器列表。
- 下游：hub「服务器」Tab、表和视图页的服务器列表（同一 `Base_serverInfo`）。

## 影响范围
- `packages/spark-data/src/data-set-command/data-set-command-view.ts`：新增 `bindDataSetCommandSubmit(view, options)`。命令视图的查询返回空结果；声明的输入列可写，新增可用；`save` 只接受新增行，逐行调用 `options.submit(row)` 并返回回执；修改或删除直接拒绝。传输失败标记为未确认，下次保存时先调 `options.verify(row)` 核验，不重放。
- `packages/spark-data` 导出、对应单测、ClassModel（`pnpm run generate:class-model-surface`）。
- `src/lowcode/resources/database/lowcode-database-dataset-extensions.ts`：新增注册命令视图 `DatabaseServerRegister`，`submit` 发 `/api/Db/registerServer`；`verify` 用 `Base_serverInfo@default` 刷新后按 rowid 判定。
- `src/lowcode/resources/database/lowcode-database-server.ts`：装配时挂上注册命令视图；Type 枚举元数据同样作用于该视图。
- `src/lowcode/resources/database/database-server-view-ops.ts`：新增流程改为在注册视图新增行 → `DataSet.saveChanges`（只含注册视图）→ 刷新服务器视图并核对 rowid；连接测试改读注册视图的输入行；编辑和删除不变。
- `src/views/features/data-platform/database-management/ui/service-management-page.vue`：注册对话框的表单绑定注册视图；编辑对话框仍绑定 `Base_serverInfo`。
- 测试：`tests/runtime/page/database/` 下服务器相关夹具与用例（夹具增加 `/api/Db/registerServer` 应答：成功、业务失败、传输失败）。

## 技术方案
1. spark-data 加 `bindDataSetCommandSubmit`，先写单测：新增并保存时调用 submit、回执接纳；业务失败时状态回到可编辑；传输失败进入未确认，核验不重放；修改或删除被拒。
2. 刷新 ClassModel，确认新成员可查。
3. 数据库专题挂注册命令视图，页面与编排切换到该视图，删除被替代的「直接插表」新增路径（`createFields` 中的 Password 预置等）。
4. 定向测试 → typecheck → lint → `tests/runtime/page/database` 全量。
5. 实页：用不可达地址注册，应报后端连接失败且列表无新增（反向）；正向全链（注册 → 回读 → 删除）需要一台可连通、未登记的测试库，若无则只记夹具结论。

## 兼容性
- spark-data 只新增 API，既有只读命令视图与 DataSpace 保存不变。
- 页面编辑和删除路径不变。

## 验证计划
- 类型检查：`pnpm run typecheck`
- Lint：改动文件 `eslint`
- 测试：spark-data 命令视图单测；`tests/runtime/page/database`
- ClassModel：`pnpm run generate:class-model-surface`
- 实页：反向注册；正向视测试库可用性

## 风险项
- 上轮直接插表疑似留下两条不可见记录（`4490A9FA…`、`4D4FC71D…`）。它们不在查询结果里，DataView 不能删除未加载的记录，需在后端核查清理；本方案不另开删除通道。
- 前端生成 rowid 依赖后端「传入 rowid 即采用」（源码描述，未在线验证）；若后端忽略，核验改为按回执 `Result` 里的 serverId 判定。
- 编辑表单仍显示模型全部字段，参考页 1:1 不在本方案范围。
