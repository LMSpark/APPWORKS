# SPARK 权限体系

> 权限事实由 lowcode 后端一次性计算并返回；前端只渲染，并构造受约束的 mutation。本文以源码为准，总览见 [system-architecture.md](system-architecture.md)。

## 1. 设计目标

1. 前端不推导授权：不按角色名、页面本地规则或配置猜权限。
2. 缺少后端证据时失败关闭：没有行级权限集合就按隐藏处理，没有快照就拒绝模型级动作。
3. 权限事实与数据同源：每次运行查询原子登记数据、原始行、总数、权限集合和系统键，共用同一基线。
4. 展示与写入分离：渲染层的可见/脱敏只影响显示；能不能写，最终由后端权限集合与 mutation 准备函数共同约束。

## 2. 数据模型

定义在 `packages/spark-data/src/types.ts`。

### 2.1 行级五个稀疏集合

每个数据行可携带：

```ts
DataRow.lingma_sys_params: { r: string[]; e: string[]; h: string[]; m: string[]; d: boolean }
DataRow.lingma_sys_key?: string   // 后端签发的当前行防篡改上下文
```

源码注释的约束：这是"后端最终返回的五个稀疏权限集合；字段集合互相独立，不得压缩为枚举"。`PermissionChecker` 中的实际用法：

| 集合 | 判定用途 |
|---|---|
| `r` | 必填字段集合（`isFieldRequired`）；同时参与可编辑判定 |
| `e` | 可编辑字段集合 |
| `h` | 隐藏字段集合 |
| `m` | 脱敏字段集合 |
| `d` | 该行是否可删除（布尔） |

### 2.2 模型级快照

```ts
DataPermissionSnapshot {
  formKey, dataSpaceId, modelId,
  allowAdd: boolean,
  systemKey: string,
  originalRows: DataRow[],
  authorizedFeatureTags: string[],
}
```

`DataPermissionSnapshotInput` 在此基础上追加 `rows` 与 `total`，是 `DataView` 登记一次后端查询结果的唯一输入。

### 2.3 两个枚举

| 枚举 | 取值 | 含义 |
|---|---|---|
| `FieldVisibility`（spark-data） | `visible` / `masked` / `hidden` | 字段读通道的最终状态 |
| `PermissionMode`（spark-utils） | `none` / `masked` / `invisible` | 页面/蓝图/导航携带的权限展示模式；页面未提供合法值时默认 `masked` |

## 3. 权限事实如何进入前端

```text
dataSpace.runtime 查询 (GetData) ─┐
permission.runtime (GetFormUserFunction) ─┴─> 宿主 toDataPermissionSnapshotInput
        -> DataView.ingestPermissionSnapshot
        -> DataView.rows (每行带 lingma_sys_params) + DataView.permissionSnapshot
```

- 宿主唯一映射器：`src/lowcode/permission/lowcode-permission-to-data-permission.ts`。查询 `formKey` 与权限快照 `formKey` 不一致时抛错。
- `allowAdd` 裁决：权限资源表对该资源明确为 `false` 时硬拒绝；否则采用同一次查询响应里的 `allowAdd`。功能标签 `authorizedFeatureTags` 直接取自权限运行快照。
- `DataView.loadFromServer` 收到整包权限快照时走 `ingestPermissionSnapshot`；不是快照形状时才按普通行数据更新。
- `ingestPermissionSnapshot` 要求每一行都有 `lingma_sys_params`，缺失即抛错；登记失败时会回滚行、总数和快照，不留半成品状态。

## 4. 判定规则（`PermissionChecker`）

全部是纯函数，输入行和快照，不读取外部状态。

| 判定 | 规则 |
|---|---|
| `canCreate` | `snapshot.allowAdd === true` |
| `canImport` / `canExport` | `authorizedFeatureTags` 含 `import` / `export` |
| `canCreateChild` | 该行有权限集合，且标签含 `create-child` |
| `canDelete` | 行的 `d === true` |
| `canEdit` | 行有权限集合，且 `r` 与 `e` 合计非空 |
| `isFieldEditable` | 字段属于 `r ∪ e` |
| `getFieldVisibility` | 无行权限集合 → `hidden`；在 `h` → `hidden`；在 `m` → `masked`；否则 `visible` |

默认语义全部失败关闭：缺快照拒绝 `create` / `import` / `export`；缺行权限集合拒绝 `edit` / `delete` 并隐藏全部字段。

`maskFieldValue`：隐藏返回空串，脱敏返回固定的 `••••`，否则返回原值字符串。前端不重新实现后端的脱敏规则，也不会还原脱敏值。

注意：`PermissionChecker` 各函数虽然接受 `permissionMode` 参数，但都以下划线忽略，判定只看行与快照。

## 5. 动作权限（`PermissionResolver`）

动作来自节点的 `permAction` 属性；没有时由内置 `action` 映射得到：

| 内置 `action` | 映射的权限动作 |
|---|---|
| `append-row`、`prompt-append` | `create` |
| `delete-row`、`delete-current`、`delete-selected` | `delete` |
| `prompt-edit`、`patch-row`、`patch-current`、`patch-selected`、`move-row`、`move-current`、`submit-current-form` | `edit` |
| 其他 | 无权限动作，不拦截 |

`isPermittedAction(action, context)`：

- `action` 为空：放行。`permissionMode === 'none'`：放行。
- `create` / `import` / `export`：看快照。
- `create-child`：需要有行，且 `canCreate` 与 `canCreateChild` 同时成立。
- `delete` / `edit`：需要有行，再看行的权限集合；没有行直接拒绝。
- 其他自定义动作名：看 `authorizedFeatureTags` 是否包含该名。

分类：`create` / `import` / `export` / `create-child` 是模型级；`edit` / `delete` / `create-child` 是行级。`isModelActionAllowed` / `isRowActionAllowed` 只对各自类别的动作做判断，其余返回放行。

代码注释的提醒：`PermissionResolver.ts` 文件头的 JSDoc 写着"缺少快照 = 基线允许"，与实际行为不符。实际代码对 `create` 等动作在缺少快照时是**拒绝**，以代码为准。

## 6. 字段渲染

### 6.1 状态计算

`computeFieldState(config, row, mode)` 输出 `FieldRenderState`：

- `readable`：可见性不是 `hidden`，且 `config.visible !== false`。
- `editable`：`canEdit(row)` 且字段可编辑，且 `config.editable !== false`。
- `shouldRender`：等于 `readable`。
- `displayValue`：仅在可读时计算，经 `maskFieldValue`。

### 6.2 字段组件的统一桥接

字段组件统一通过 `useFieldPermission`，禁止散落地直接消费权限能力键。组合行为：

| 场景 | 展示值 | 编辑器初值 |
|---|---|---|
| 无状态（没有行） | 正常 | 正常；`readable` 为真、`editable` 为假 |
| 可见，不可编辑 | 原值 | — |
| 脱敏，不可编辑 | `••••` | — |
| 隐藏，不可编辑 | 空串 | — |
| 脱敏或隐藏，**可编辑** | 空串 | 回落为组件的 `fallbackValue`，不回显脱敏值 |

组件是否渲染：`readable || editable`。表格单元格同理，隐藏返回空串，脱敏返回 `••••`。

### 6.3 `usePermission`

`usePermission()` 是唯一的 Vue composable 桥，内部消费 `PAGE_PERMISSION_MODE` 与 `SUBTREE_FIELD_POLICY` 两个能力键：

- `isPermitted` 会带上页面的权限模式。
- `resolveFieldState` 在子树字段策略为 `unrestricted` 时传入模式 `none`，否则传页面模式。注意 `Checker` 层的字段判定当前并不读取该参数。

页面模式由 `SparkPageRenderer` 从路由元信息 `permissionMode` 读取，非法值回落为 `masked`。

## 7. 脚本侧 API

`PermissionFilter` 提供给页面脚本（经 `ScriptContext` 暴露）：

| 函数 | 作用 |
|---|---|
| `filterDeletableRows` / `filterEditableRows` | 按 `d` / 可编辑性过滤行 |
| `filterFields` | 保留可见字段，并丢弃以 `_` 开头的字段 |
| `filterDisplayableFields` | 丢弃隐藏字段，以 `_` 开头的字段原样保留 |
| `getEditableFields` / `getVisibleFields` | 在给定字段列表里筛选 |
| `extractPermissionSnapshot` | 从数据源的 `permissionSnapshot` 取快照；形状不符返回 `null` |

这些是展示层过滤，**不是安全边界**。

## 8. 写入约束

### 8.1 运行时 mutation 的准备

`DataSpaceRuntimeApi.prepareMutation`（`spark-lowcode-api`）只生成命令，不在包内执行 HTTP。它强制：

- `formKey`、`dataSpaceId`、`modelId` 必须与 preimage 一致。
- 业务变更不能提交系统字段，字段必须属于前端模型。
- 新增：`preimage.allowAdd` 为真，并注入 `lingma_sys_key`。
- 修改：字段必须属于该行的 `r ∪ e`，主键只能用于定位；该行必须带 `lingma_sys_key`。
- 删除：该行 `d` 必须为真，并带 `lingma_sys_key`。
- 至少有一项变更。

产出的命令固定 `risk: 'medium'`，要求记录 journal 与读回确认，并附带可恢复到 preimage 的补偿信息。

### 8.2 旧 CRUD 通道

`CrudService` 上传数据前会剥离 `lingma_sys_params` 与 `lingma_sys_key`（`sanitizeDataForUpload`），系统字段不随业务载荷上传。

### 8.3 动作里的消息

动作向用户展示行消息时，系统字段被去掉，隐藏字段变空串，脱敏字段显示 `••••`，不泄漏原值。

## 9. 渲染前拦截 `onBeforeRender`

节点属性 `onBeforeRender` 是同步钩子（`components/support/beforeRender.ts`）：

- 入参包含节点 `id`、`type`、安全副本 `props`、行、`dataSource`、**当前模型的 `permissionSnapshot`**、宿主类型。
- 返回 `boolean` 表示可见性；返回对象可带 `visible` / `display` 与要合并回节点属性的补丁。
- 必须同步返回；返回 Promise 会被忽略并告警，抛错同样被忽略并告警，节点回落为原可见性。

它适合做展示层条件，不是授权手段。

## 10. 禁止事项

1. 不要在前端重新实现脱敏规则，也不要把 `••••` 当成输入初值写回。
2. 不要把 `hidden` 理解成"绝对不渲染任何宿主"：可编辑的字段即使隐藏也可能渲染输入控件（见 6.2）。
3. 不要把 `PermissionFilter` 当安全边界；写入的最终约束在后端与 mutation 准备函数。
4. 不要散落地用 `sparkConsume` 读取权限能力键，统一走 `usePermission()` / `useFieldPermission`。
5. 不要在宿主里再造第二套标签或 `allowAdd` 推导，统一走宿主映射器。

## 11. 源码入口与测试

| 内容 | 位置 |
|---|---|
| 类型与快照登记 | `packages/spark-data/src/types.ts`、`data-view.ts`（`ingestPermissionSnapshot`） |
| 判定与过滤 | `packages/spark-component/src/permission/`（`PermissionChecker`、`PermissionResolver`、`PermissionFilter`、`FieldRenderHelper`、`usePermission`） |
| 字段桥接 | `packages/spark-component/src/components/fields/context/useFieldPermission.ts` |
| 宿主映射器 | `src/lowcode/permission/lowcode-permission-to-data-permission.ts` |
| mutation 准备 | `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-mutation.ts` |
| 测试 | `tests/auth-nav/permission-checker.test.ts`、`permission-filter.test.ts`、`permission-resolver.test.ts`、`lowcode-permission-to-data-permission.test.ts`；`packages/spark-data/src/tests/permission/runtime-permission-snapshot.test.ts`、`crud-service-permission.test.ts`；`packages/spark-lowcode-api/src/platform/permission/permission-api.test.ts` |
