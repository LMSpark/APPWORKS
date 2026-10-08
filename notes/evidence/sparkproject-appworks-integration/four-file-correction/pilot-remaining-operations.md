# Data-space catalog: remaining operation contracts

只读研读，不运行测试、浏览器或后端请求。固定参考是 `E:/r/sparkproject` 的提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`；原页位于 `apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`。当前页面计划与实际进度见 `notes/plan-data-space-four-file-pilot.md`、`notes/plan-appworks-four-file-integration.md`：四文件样板已有列表、查询、筛选、分页、创建人投影和先收集后新增保存；余下操作仍不能声称完成。

## 权限和调用边界

本次按“无角色模型”处理。参考页的 `useSparkResourceAuth(queryContext)` 只是把当前查询回执适配为 `canAdd/canEditRow/canDeleteRow/canEditField`，并没有用用户角色判权；计划也明确 admin 只是验收身份。四文件继续消费本次 `DataView` 的 `addActionState()`、`editActionState(row)`、`deleteActionState(row)` 和 `fieldAccess(row, field)`。任何操作都不得因验收登录名是 admin 而放行。

当前 `$page` 脚本上下文只显式暴露 `getDataSet(scenarioId)`、`resolveView(binding)` 和页面交互服务（`showConfirm/showPrompt/selectEntities/showDialog` 等）；数据编辑须使用本次 `PageRuntime` 已装配的 DataSet/DataView 和同一原查询 owner。`DataView.editRowById/removeRow` 在 query-owner 视图内形成 staged 变更，`DataSet.saveChanges({ views: [{ tableName, viewId }] })` 提交指定视图。PageRuntime 的 `isDirty` 覆盖 DataView pending changes 和 editing rows，未保存改动会影响页面关闭。这些是实现余下页面操作的本仓入口，不构成其他场景或其它用户的授权。

## 原页剩余操作与当前底座

| 操作 | 固定参考的实际动作 | 当前可复用入口与精确边界 |
|---|---|---|
| 编辑 | 原页 `handleEdit()` 要求当前行且 `canEditRow(rowid)`；将 rowid/sysid/Name/description 复制到对话框。应用在编辑时禁用；Name 与 description 分别由 `canEditField(rowid, field)` 决定是否可编辑。`handleSubmit()` 校验后调用 `AppWorksDataSpaceCatalog.update({rowid, Name, description})`，再关闭并重查。描述为空时，旧逻辑在原值为 null/undefined 时省略字段，否则提交空字符串；不能不加判断地把所有空值改成 `''`。 | 现有行可用同一 `Base_DataSet@catalog` DataView：检查 `editActionState(row)`，逐个检查实际写入字段的 `fieldAccess(row, field).write`，再通过 `editRowById(id, patch)` 形成 staged 更新，最后用本场景 `DataSet.saveChanges` 指定 `{tableName:'Base_DataSet',viewId:'catalog'}`。`r-form` 默认绑定 `currentRow`，现有行字段遵从 FieldContext 的 DataView 权限；`submit-current-form` 校验并调用 `editRowById`，但它本身不会执行 DataSet staged-save，必须另行保存。不要把 `applicationId/sysid` 或只读审计字段放入可写 patch。测试须用不同 fieldAccess 响应覆盖单字段允许/拒绝，不能用 admin 推断授权。 |
| 删除 | 原页 `handleDelete()` 要求选中行并通过 `canDeleteRow(rowid)`；确认后再检查页面 execution scope，调用 `catalog.remove(rowid)`；成功后清当前行，若当前页删空则页码减一并重查。 | 同一 DataView 的 `deleteActionState(row)` 是行权限入口；确认期间可能切换当前行/页面，因此确认后还要核验目标身份仍一致并重新检查权限。之后 `removeRow(id)` 是本地 staged delete，再以显式 view selector 保存；失败不能当成功关闭/移除数据，保留原行/错误语义并重查确认。成功后按原页规则处理空页并回读。`delete-current` 普通 action 表达远端记录删除，不要把它等同于本页 pending-create 的本地取消。 |
| 设计 | 原页 `handleDesign(row)` 设置当前行并开启大尺寸、销毁即卸载的对话框；内部异步装载 `DataSetDesign`，传入数据空间 rowid。子页 `data-set-design-page.vue` 再由 `useDataSetDesignPage` 建立 `AppWorksDataSpaceDesign` 与 `AppWorksDataSpaceDesignSurface`，使用 `SchemaGraph`、NodePanel、EdgePanel 处理模型来源、模型/关系画布、输入参数及保存；还保留布局文件丢失时的只读预览和经二次确认重建路径。 | 当前仅有 `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` 的正式元数据读取（`read/readModels/readModel/readRelations`）和 `prepareMutation`；后者只生成带 preimage/journal/readback/compensation 要求的命令，不是图形设计器、提交器或整条回读/补偿工作流。仓内当前没有原页的 SchemaGraph 设计面板等价物；现有 `DataSpaceDesignApi` 不能直接替代整个“设计”操作。该项须作为独立大闭环处理，精确盘点设计 UI、写入执行器和恢复测试后再拆解，不要在列表页 script 重造设计器。 |
| 复制 API | 原页 `handleCopyApiInfo(row)` 要求正式 rowid；以固定设计场景 `8D1AB14DD8277F3E7017CD38F77B09FD` 和 dataSpaceId 构造 `AppWorksDataSpaceDesign`，读取 API 信息文本，调用 `copyTextToClipboard`，再提示成功；异步后检查页面是否仍有效。其设计 hook 依赖 `buildDataSetApiInfoTextFromSnapshot`。 | 当前正式 `DataSpaceDesignApi.read` 可读设计快照，`readModel(s)` 可读模型/字段元数据；本仓没有旧 `readApiInfo` 或 `buildDataSetApiInfoTextFromSnapshot` 同等 formatter。`PageServiceCapability`/`$page` 没有 clipboard 方法；目前 `navigator.clipboard.writeText` 仅在原生 Vue 页中有用例，不能据此把它当成脚本公开合同。要恢复该按钮，需要可由四文件安全调用的只读信息生成入口与受治理剪贴板宿主入口，且保留当前页面身份失效检查；直接泄露底层 api/client 或按猜测格式拼 API 文本都不是已验证复用路径。 |
| 查询绑定 | 原页 `handleQueryBinding(row)` 记录 rowid/sysid，开 dialog，异步取得 blueprint 场景，再调用 `AppWorksProjectBlueprint.readDataSpaceBindings(dataSetId)`。子查询校验 node 身份、`conid` 对数据空间身份的可读权限，构建完整 parent path（遇循环/缺父节点失败），返回 `{nodeId,path,navigationTarget}` 并排序。加载/失败/关闭均通过 binding revision + 当前 rowid/sysid + page execution scope 防止过期结果落入对话框。 | 当前 `LowcodeProjectBlueprintApi` (`packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts`) 有固定 AppWorks 蓝图身份上的 `readRecords(projectId)` 与授权读取，但没有 `readDataSpaceBindings(dataSpaceId)` 或同名场景解析器；records 读取也不是原方法的 `conid` 字段授权过滤、绑定路径和过期对话框组合。它只在宿主 `LowcodeApi.blueprint` 暴露，本页 `$page` 不提供该 API。不能仅凭 `readRecords` 可以拿到蓝图节点就宣称等价；当前缺少脚本可用且按当前权限投影的查询绑定入口，需先定一个最小宿主服务/已配置 DataView 路径，再测试空绑定、隐藏 conid、重复/缺父/循环与切行过期。 |

## 精确源码路径

固定参考提交：

- `E:/r/sparkproject/apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`：表格按钮、编辑/删除/设计/复制 API/查询绑定处理函数、dialog 与 stale revision 生命周期。
- `E:/r/sparkproject/apps/appworks/src/ui/composables/data-table/auth.ts`、`.../dialog/permission.ts`：原查询权限适配与字段可编辑判断。
- `E:/r/sparkproject/apps/appworks/src/data/api/data-set/list.ts`：原目录查询、create/update/remove、用户名 hydration。
- `E:/r/sparkproject/apps/appworks/src/data/api/data-set/design/data-space-design.ts`、`.../design/ui/data-set-design-page.vue`、`.../design/ui/use-data-set-design-page.ts`：设计工作台、API 生成读取、保存/加载协调。
- `E:/r/sparkproject/apps/appworks/src/data/api/ApplicationFunMan/project-blueprint-owner.ts`：`readDataSpaceBindings` 的正式节点读、字段权限、父路径及排序。
- `E:/r/sparkproject/apps/appworks/src/ui/utils/clipboard.ts`：原生 clipboard helper。

当前 SPARK_AppWorks：

- `packages/spark-data/src/data-view.ts`、`packages/spark-data/src/dataset.ts`：`fieldAccess/actionState/editRowById/removeRow/saveChanges` 与指定视图 staged 保存。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`、`.../runtime/data-space-runtime-api.ts`、`.../runtime/protocol/data-space-permission.ts`：原查询权限、formal identity、同一查询 owner 保存。
- `packages/spark-component/src/page/context/buildPageContext.ts`、`packages/spark-component/src/runtime/app-services.ts`：脚本实际 `$page` 表面及宿主服务合同。
- `packages/spark-component/src/page/actions/action-data.ts`：`submit-current-form`/`delete` 执行动作。前者验证表单后调用 `editRowById`；`save-dataset` 在同文件的 `executeSaveDataSet` 调用 `DataSet.saveChanges`。
- `packages/spark-component/src/components/containers/data-views/RendererForm/RendererForm.vue`、`zero-code.ts`、`packages/spark-component/src/components/fields/context/useFieldPermission.ts`：r-form 的 currentRow/字段编辑与表单本地 API；`resetFields` 不提交 DataSet。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`、`data-space-design-mutation.ts`：设计快照读取/纯命令 prepare 的边界。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts`：当前蓝图服务入口与项目身份固定查询边界。
- `packages/spark-component/src/page/context/types.ts`、`packages/spark-component/src/page/context/buildPageContext.ts`：当前页脚本注入边界；没有 clipboard、data-space designer 或 query-binding 方法。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`：现有样板覆盖四文件列表渲染、取消/新增保存、权限与未知保存结果；当前没有 edit/delete/design/copy API/query binding 用例。

## 下一闭环建议

优先做**现有行编辑**，限定只编辑原页的 `Name` 和 `description`。它沿用正在运行的 `Base_DataSet@catalog` 同一 DataView 和原查询 owner，不需要新场景 API、蓝图读取或图形设计器；且比先落远端 delete 或整个 design workbench 更易控制影响面。最小范围建议：选择现有行后绑定 `r-form` currentRow；行级 `editActionState` 不允许时不开放提交；字段逐一消费 `fieldAccess`，保留应用关联与审计字段只读；提交只构造 Name/description 的实际变更 patch，经 `editRowById` 与显式 `saveChanges({views:[...]})`；成功按原 rowid 回查；失败保留可见状态，不自动重发。字段权限和拒绝用测试态权限回执区分，不引入角色或 admin 分支。

开始该闭环前，仍需主控把确切 rule/script/测试改动文件纳入子计划。随后 delete 可单独做 destructive confirmation + permission + rowid identity + 空页调整；copy API、query binding 是服务入口缺口；design 必须另行拆成编辑器与 mutation executor 工作包，不能混入编辑闭环。

未运行测试或浏览器，未调用在线 API。上述结论均来自指定提交、本仓当前源码和已存在测试文件；不是对剩余操作成功的宣称。
