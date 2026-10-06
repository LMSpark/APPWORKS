# SPARK 权限体系

> 权限事实由 SPARK 后端计算，数据与权限一起返回；前端消费原查询上下文，后端验证写入。本文依据当前 AppWorks、参考 `E:/r/sparkproject` SPARK API 和 `E:/lowcode-jdk17` 权限实现核对。源码入口见文末，总览见 [system-architecture.md](system-architecture.md)。

## 字段读写是两个通道

E/R/h/m 是后端返回的稀疏字段名单，各自只作用于命中的字段；未列入 h/m 的已返回字段可以正常读取。字段不存在、返回空值和受保护旧值是不同事实，不能互相代替。

| 返回项 | 含义与消费 |
|---|---|
| `e`（E） | 字段写许可 |
| `r`（R） | 必填字段；后端 `RowPermissionHandler` 同时将其加入 E，正式输出 `R ⊆ E` |
| `h` | 原值不可见；即使键存在且返回 null，也不能恢复原值 |
| `m` | 返回值已由后端保护，不能恢复原值 |
| `d` | 当前行删除许可 |
| `c` | 树形自引用模型中，当前行能否作为新增记录的父行 |
| `allowAdd` | 模型新增动作许可，不代表新增草稿所有字段可写 |

读取结合实际返回值与 h/m；最终载荷同时包含 h/m 时前端投影为不可见。写入与读状态独立，h/m 不撤销 E。R 不是可读名单，不能据此把正常字段设为只读。

本仓 `DataSpaceRowPermission.fieldAccess` 按 E 判定 write，按 `E && R` 判定 required；参考 sparkproject `DataRowAuth.fieldAccess` 按 `R || E` 判定 write，按 R 判定 required。对于后端正常的 `R ⊆ E` 输出两者等价；不能将参考实现描述成只有 E 命中，也不能自行补齐异常载荷。缺权限载荷时遵循具体查询入口的 missingAuthPolicy；本仓当前模型查询默认 `allow`。缺少原查询上下文、未返回行、空或重复主键，不适用该缺载荷策略，不能借此补权。

隐藏或脱敏但允许写时使用只写交互：旧值不回显，输入初值使用组件 fallback，只有用户明确输入的新值进入变更。未输入、取消、失活和上下文失效都不应把空值或遮罩自动提交。显示遮罩 `••••` 是前端呈现，不是可写业务值。

## 模型、行和字段能力

模型条件由后端 `PermissionAssembler` 汇总，不能从当前分页、空结果或首行名单猜整个模型权限。行编辑则是已返回字段写能力的投影：本仓按该行 E 非空，参考 sparkproject 按 R/E 非空。查看消费已返回且唯一的行身份；参考 `hasShowField` 对存在权限载荷的行返回可显示，因为 h 只隐藏指定字段，不能将整行推断为不可见。

删除独立消费 d，树父行新增子行独立消费 `c === true`，模型新增独立消费 allowAdd。行可编辑不授予删除或新增子行；模型新增不授予草稿字段权限。前端不重算角色、规则投票、隐藏/脱敏合并或后端条件。

按钮、链接和声明式动作统一消费 DataView 的 `addActionState`、`editActionState`、`deleteActionState`、`createChildActionState` 和 `viewActionState`。未知功能标签没有原查询许可时拒绝；导航 `permissionMode` 不覆盖数据授权。工具调用的文本扫描 gate 也不代替权限验证。

## 原查询 owner 与私有基线

```text
LowcodeDataSpaceAssembler：正式模型 + ScenarioViewFile
    → DataSpaceRuntimeApi.bindModelView(DataView, model)
    → GetData：场景、模型、正式字段投影
    → DataSpaceQueryContext：数据、总数、权限与原行凭据
    → DataView：公开业务行与集中呈现入口
```

查询 owner 持有原始返回行、权限名单和签发凭据，公开行剥离 `lingma_sys_params`、`lingma_sys_key`。消费者不得补写系统字段、替换基线或读取公开行来重建授权。当前 DataView 没有旧 `permissionSnapshot` 或 `ingestPermissionSnapshot` 登记通道，宿主也不再另行映射公开权限快照。

权限索引使用查询声明的正式主键，绑定正式模型后核对主键身份；不猜 id/rowid，不从首行创建新增模板。`_pk` 只是前端行标识，不属于后端业务主键或提交字段。查询全部页通过后才发布上下文；执行域变更或上下文失效明确报错。查询失败保留可呈现的旧结果并暂停写入；刷新、清空、重置和结果替换不能覆盖未保存变更。

## 组件与脚本消费

`usePermission.resolveFieldState` 经绑定 DataView.fieldAccess 返回 readable、editable、displayValue 和 shouldRender；显示配置可进一步收窄呈现，不授予写许可。字段组件通过 `useFieldPermission` 统一桥接，required 来自 DataView；隐藏/脱敏且可编辑时抑制旧值。

`SUBTREE_FIELD_POLICY=unrestricted` 仅供筛选等明确的本地输入子树，使用独立模型，不修改业务 DataView 的授权。按钮与字段随查询状态、行和选择变化更新。行消息及同步 `onBeforeRender` 钩子也消费 DataView，不转发第二份权限对象；钩子控制展示，不能授权。

脚本通过 `$page.getDataSet(scenarioId)` 或 `$page.resolveView('#scenarioId@table@view')` 获取明确场景，再调用 DataView.fieldAccess(row, field) 和动作状态方法。仅明确 mainScenarioId 的调用允许局部 `table@view`。脚本没有旧 `$dataSet` 注入或 permission 转发命名空间，权限随当前调用的原查询上下文消费。

## 保存与后端强验证

DataView.saveChanges 和 DataSet 的统一保存入口使用原查询 owner。同一批次要求同场景、同 owner、模型不重复；DataSpaceRuntimeApi 按执行域/场景/模型核验上下文归属，串行化同模型读写。请求为实际 `/api/DataOperation/BatchTableOperateRequestByCRUD`，场景身份通过 x-FormKey；不是旧 prepareMutation 准备命令。

更新与私有原行基线比较，仅封包真实差异；删除定位唯一原行。业务候选值不按前端 E/R 名单静默裁剪，正式模型负责字段身份与可提交输出校验，计算字段不能作为业务写入。调用方的系统字段及 `_pk` 被剥离，修改/删除回放对应原行 token，普通新增和树根新增使用原查询表级 token，树子新增回放唯一原父行 token。前端不解码 token 建立另一套授权。

后端 `DataPermissionAspect` 和 `PermCompactToken` 负责验签、用户及行身份绑定、令牌验证、E/R/d 检查，以及必填和保存条件等实际校验。新增验证全部必填，更新验证本次提交涉及的必填字段。默认权限分支与历史凭据处理以后端源码为准，不能把前端呈现当最终安全边界。

树新增子行的呈现按父行 c。私有查询上下文按正式模型 ParentField 和 TopValue 区分根与子行，并通过正式字段映射定位原查询父行；子行只接受唯一父身份、明确 c=true 和非空原父行 token。缺父、重复身份、缺凭据及尚未回执的新增父行在 HTTP 前失败，不走后端表级 token 兼容分支。新增父行回执未提供签名 c 凭据时，须重新查询父行后再新增子行。后端继续检查签名、父身份、存在性和新增子行条件，allowAdd 或行 E 不能代替 c。该封包链已由运行 owner 单元测试验证，真实后端验收仍需实际请求证据。

实际回执必须核对模型、动作数量和行身份后才推进基线。DataView 只接纳后端实际确认字段，保留保存期间的新编辑；新增返回真实主键后重建本地身份。成功回执推进独立上下文，不就地修改其它视图共享的原权限。请求失败、过期或身份变化不假装保存成功，也不伪造回滚。源码与单元测试接通不等于真实后端验收已完成。

## 源码与验证入口

| 内容 | 位置 |
|---|---|
| 双通道与行能力 | `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-permission.ts` |
| 原查询与保存基线 | `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts` |
| 查询/保存 owner 与实际请求 | `data-space-runtime-api.ts`、`protocol/data-space-request.ts`（同 runtime 目录） |
| DataView 查询、呈现与回执 | `packages/spark-data/src/data-view.ts` |
| 模型装配 | `src/lowcode/data-space/lowcode-data-space-assembler.ts` |
| 组件消费 | `packages/spark-component/src/permission/`、`components/fields/context/useFieldPermission.ts` |
| 参考 SPARK API | `E:/r/sparkproject/packages/data/spark-api/src/protocol/permissions.ts`、`public/query-permission.ts` |
| 后端字段及强验证 | `RowPermissionHandler.java`、`PermissionAssembler.java`、`DataPermissionAspect.java`、`PermCompactToken.java`（lowcode-jdk17） |
| 权限/保存合同测试 | `packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-permission-parity.test.ts`、`data-space-save-parity.test.ts`；`tests/auth-nav/`、`tests/renderer/` 中权限消费者测试 |
