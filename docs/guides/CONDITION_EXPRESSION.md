# 条件表达式（DataViewFilter / computeExpression）

`filterExpression` 筛选行，`computeExpression` 逐行计算派生列。二者保持独立职责。

## 1. 唯一公开过滤合同

前端组件、脚本、视图 JSON 与查询输入统一消费 `DataViewFilterTree`。状态与校验由不可变 class `DataViewFilter` 承接，定义位于 `packages/spark-data/src/query/filter/`。

```json
{
  "logic": "and",
  "filters": [
    { "field": "status", "operator": "eq", "value": "open" },
    { "field": "amount", "operator": "gte", "value": { "Type": "GetTableField", "Field": "threshold" } }
  ]
}
```

条件为 `{field, operator, value?}`，分组为 `{logic: 'and' | 'or', filters}`。旧 `op/children`、否定节点和 `kind: 'field'` 方言不再提供类型或兼容转换。

公开操作符共 18 项：

| 类别 | 操作符 |
|---|---|
| 比较 | `eq`、`ne`、`gt`、`gte`、`lt`、`lte` |
| 空值 | `is-null`、`is-not-null`、`is-empty`、`is-not-empty` |
| 文本 | `contains`、`not-contains`、`starts-with`、`not-starts-with`、`ends-with`、`not-ends-with` |
| 集合 | `in`、`not-in` |

范围控件直接生成 `gte/lte` 的 AND 分组，无公开 `between` 方言。完整目录以 `data-view-filter-catalog.ts` 为准。

非一元条件必须有显式 JSON 值；`''`、空白、`null`、`[]`、`0`、`false` 均保留。值函数使用 `{Type, ...}`，完整 JSON 载荷保留。普通字符串不插值：`$[...]` 等文本只是常量。清空由明确的 `undefined` 表示；解析失败不能清空已有过滤，也不能丢弃坏子节点后执行部分约束。

## 2. DataView 与执行边界

DataView 私有持有已应用的 `DataViewFilter`，`filterExpression` 返回冻结树。脚本赋值、`setFilter` 与 `configure` 统一解析并保护未保存修改。`setFilter` 对静态视图执行本地筛选，对远端视图刷新；`executeFilter` 可重复执行相同条件。配置赋值本身不发远端请求。

`DataSet.resolveCascadeFilter` 从显式 query 级联的通用输入值生成常量 `eq/in`：字段值或选中主键数组，当前行只是取值指针。模型关系不自动生成 viewCascades；远端将级联约束与当前过滤按 AND 合并。字段选项查询与子值处理见[数据空间主合同第 6 节](../architecture/DATAFLOW_ARCHITECTURE.md#6-两类关系与值级联)。

静态求值由内部 `DataViewFilterLocal` 执行：

- 只支持常量、`GetConstValue` 与当前行 `GetTableField`。
- 整树先检查服务端函数，即使位于短路分支也拒绝；不在前端模拟服务端上下文。
- 条件字段和当前行引用必须存在，不猜限定表名或别名。
- 数字按数值比较，其余标量沿用 JS 字符串比较；集合与文本使用本地 JS 语义。
- `is-null` 为 null/undefined；`is-empty` 为字面量空字符串，空白文本不 trim。
- 空 AND 为真、空 OR 为假；远端保留原分组，不据本地结果简化。

`spark-data`的`DataViewFilterCodec`统一编解码公开树与SPARK存储格式，API查询及元数据保存复用它。`GetInputParam`从捕获的queryContext解析为常量，缺参数拒绝；其余受支持的服务端值函数保留载荷交后端执行，不在前端推断SQL、排序规则或来源的空值语义。

## 3. computeExpression（计算列表达式）

实现位于 `packages/spark-data/src/strategies/computed-column-delegate.ts`。

## 3.1 执行模型

`computeExpression` 是“逐行求值”，用于派生列。

- 纯表达式：自动包装 `return (...)`。
- 多语句函数体：要求表达式自己写 `return`。
- 求值上下文：`with(__row) { ... }`，行字段可直接引用；正式模型的配置计算使用受权限约束的只读行代理，隐藏/脱敏输入不可读。
- 可读取 `ctx`（通过 `setComputedContext` 注入）。

## 3.2 支持能力

- 算术、字符串拼接、三元表达式。
- 多语句 `if/else`、循环、函数定义。
- 链式计算列（列依赖列）。
- 子表聚合函数（依赖关系配置）：
  - `$sum/$count/$avg/$min/$max/$list/$join`

## 3.3 错误与降级策略

- 编译失败：正式 modelBinding 的配置列明确抛错；普通局部模式跳过坏列并记录警告。
- 运行时报错或输入不可读：该列写入 `undefined`，其他列继续；正式计算结果的可读性与当次查询代次绑定。
- 表达式长度有上限（防止超长注入）。

子表聚合通过 resourceRelations 的完整过滤表达式定位，读取子模型 default 视图。多个候选关系会报歧义，不能隐式选首条；它不是所有命名视图或未加载服务端记录的聚合。

## 3.4 与 DataViewFilter 的边界

- `computeExpression` 负责“算值”。
- `filterExpression` 负责“筛行”。
- 视图聚合 `aggregates` 负责“整列汇总”。

三者互补，不互相替代。

---

## 4. 参考实现与验证

- 公开合同与值对象：`packages/spark-data/src/query/filter/`。
- 实际视图与级联：`packages/spark-data/src/data-view.ts`、`dataset.ts`。
- 唯一存储codec：`packages/spark-data/src/query/filter/data-view-filter-codec.ts`。
- 控件条件生成：`packages/spark-component/src/components/containers/runtime/container-filter.ts`。
- 完整树及值函数编辑：`packages/spark-component/src/components/containers/filter/`，实际入口 `FilterExpressionEditor` 由 `RendererFilter` 消费。
- 本地效果、不可变状态与脏保护：`packages/spark-data/src/tests/data-view/query/data-view-filter-expression.test.ts`。
- 真实宿主请求组装：`tests/runtime/auth-nav/data-space/lowcode-data-space-runtime.test.ts`。

`RendererFilter` 从同一 DataView 读取已应用过滤，编辑器接收实际 columns 与明确的 `filterFunctionContext`，不从页面表名猜后端模型名称。条件字段目录排除isComputed框架列（如_pk）和computeExpression本地计算列；条件树与JSON按同一目录校验，旧失效字段原文保留供修正或取消，不映射成物理主键。递归 AND/OR、常量和完整 JSON、值函数共用 DataViewFilter 校验。缺字段/缺值、坏 JSON 和未完成组保留草稿并阻止应用；只有明确清空才提交 undefined。未修改的后端扩展函数保真保留，修改时要求相应编辑定义。

默认条件界面沿参考过滤编辑器的递归分组交互；“JSON”打开仓内 JsonTreeEditor，可切换 SparkJsonEditor 文本模式。两个 JSON 模式与条件树共用同一表达式，原生类型及嵌套分组保留；非法文本不能切入 JSON 树，修复后才可切换。切回条件树或应用时仍校验完整过滤合同，取消恢复上次已应用的表达式，组件不自行保存。

参考仓的 FilterBuilder、FilterGroupEditor、ValueFunctionDialog 本来就是独立组件。本仓由既有 FilterExpressionEditor、FilterExpressionGroup、FilterValueFunctionDialog 承接交互，公开复用入口是 `r-filter-expression`，业务页仅绑定消费。默认 `display="dialog"` 在页面显示表达式摘要，点击打开“过滤设置”；`displayMode="inline"` 将摘要显示为行内文本，`box` 为输入框样式。`display="inline"` 则直接展开编辑区，两个属性语义不同。摘要保留嵌套分组括号、字段标题及值类型，值函数密码成员不进入摘要。数据空间请求区使用弹窗加行内摘要，高级属性工作区仍可直接展开。

`r-filter-expression` 的字段目录和函数候选更新不会重建正在编辑的条件树、JSON或内部值函数窗口；应用按最新目录校验，失效选择保留供修正。候选内容变化使旧应用回调失效；绑定、行、字段、原值、权限及编辑模式切换仍释放原会话。此行为同时适用于原生树和SPARK文本存储，取消不写回DataView。

过滤和值函数窗口默认支持手动全屏，在900px及以下自动全屏，关闭后复位；两个窗口的尺寸状态独立，切换尺寸不丢草稿。`r-filter-expression` 可配置 `placeholder / title / clearable / dialogWidth / autoFullscreenBelow`；属性合同通过 Pick 复用 `FilterExpressionEditorProps`，指南沿该声明查询。过滤窗口默认宽980px、标题“过滤设置”、空摘要“空”；undefined沿用默认，空字符串和false保留。clearable=false隐藏快捷清空入口，不改变权限，也不禁止通过条件树明确编辑为空。自动全屏阈值为0或负数时关闭自动全屏，手动入口仍可用；过滤窗口配置不影响值函数窗口。内部实现与标准 `r-dialog` 共用；查询其属性指南时，沿 `RDialogProps` 的声明关系查看 `DialogFullscreenOptions`。标准弹窗默认保持原尺寸行为，按需配置 `fullscreenable / autoFullscreenBelow / resetFullscreenOnClose`。

值函数参数事件绑定本次打开、当前函数类型和候选上下文。切换类型保留各自草稿；关闭重开、替换原值或更新候选后，旧控件与旧保存回调失效。引用表切换会更新引用字段与外键字段候选，失效原值保留并在确认时诊断，不默认选择或静默清空。候选选择更新与保存身份分开处理，正常选择后立即保存仍提交最新值。组件只编辑函数定义；候选可选不代表该函数在任意查询位置都有执行实现。

标准字段入口`r-value-function`区分候选刷新与编辑身份切换：同一选项DataView查询回填或functionContext更新时，窗口和各函数草稿保留，确认使用最新候选，旧回调失效；目标绑定、行、字段、原值、写权限或选项视图键改变则关闭旧会话。公共`useFieldOptions`通过现有DataView事件桥订阅选项视图，候选行、配置和读取权限按当次视图重新投影，切换和卸载释放订阅；无需业务页再手传数组或强制重建组件。候选被移除时保留参数供修正，拒绝确认，不自动清空。

独立编辑器的`functionContext.tables`可在已有模型名称目录上声明`loadFields`。省略`fields`表示尚未提供字段，可由正式数据owner按模型读取；显式`fields: []`是已确认的空目录，不触发补查。值函数窗口只读取所选模型，保留全部模型候选和参数草稿；失败显示原因并允许重试。树/JSON切换或应用前，`DataViewFilter.loadEditorContext`只读取表达式明确引用的GetRefData、GetGroupData、GetExpData模型，按同一完整合同校验后提交；不递归猜测常量里的对象或未知扩展。读取不修改输入目录，不执行值函数，不授予权限，不持久化回调；关闭、切换上下文、修改草稿或释放后旧响应不可应用。实际查询、身份/权限及缓存仍由目录owner承担。此公共能力不表示所有页面已改为按需字段读取，数据空间关系工作区的全目标装配剩余项以主合同及E62为准。

数据空间的字段输出GetRefData使用同库物理资源候选：显示注册名和来源名，保存来源MetaName及正式字段Name，不保存输出别名，也不提供计算字段。它通过既有definitions覆盖对应函数候选，未改变其他函数的模型目录。多个模型注册同一来源时复用已读取字段，不强制加载别的模型；来源或字段身份不可读时显示诊断并拒绝引用。旧函数原文保持，需由用户明确修正后保存。数据处理输入映射显式使用operation-input目录，不混用该物理输出合同；普通DataView过滤和原生模型关系也不因编辑器共用而改变执行语义。

设计器的引用目录按本模型和上游模型组织。本模型字段来自modelFields及其编辑覆盖；上游身份优先从原生ScenarioViewConfig的resourceRelations和modelBinding定位，不要求先装配整个目标DataSet。旧格式按需读取后端关系端点并适配，已有有效运行定义也可复用。loadModelInputFields把明确的上游模型ID交给命名视图查询，工作区消费其结果，不以全空间字段目录补齐未读取字段。身份、范围或读取失败明确诊断；本模型和常量编辑保留。字段编辑与计算字段新建使用同一引用合同，DataTable数据处理不另造执行器。这里仍是按上游集合读取，不能宣称已实现任意单字段依赖加载，也不承诺后端在每一种查询模式执行所有值函数。

`readonly` 允许浏览条件树及JSON，但隐藏清空/应用并拒绝修改事件；`disabled` 则禁止打开和写入。标准绑定会自动将当次可见但不可写字段置为只读，业务传入false不能放大权限，隐藏/脱敏定义不显示。运行查询过程的临时禁用保留未应用草稿，查询拒绝后仍能修复；权限/绑定失效沿原DataView公共守卫处理。

应用经 DataView.executeFilter。未保存修改导致拒绝时，弹框保留新草稿并显示错误，原过滤与编辑值保留；普通输入面板也返回失败状态、显示错误，不把日志记录当成功。运行 DataView 实例切换后旧编辑器卸载，不能将旧草稿应用到新实例。

组件挂载与实际 DataView 验证位于 `packages/spark-component/src/tests/filter/filter-expression-editor.test.ts`。场景设计器、场景文件装载及完整 SPARK 查询/保存接线仍须由对应消费者与运行证据证明，不能用过滤编辑测试替代。

`r-filter-expression`（RendererFilterExpression）是过滤**定义**编辑的标准系统组件。`dataViewKey`按`空间ID@模型名称@视图名称`定位定义视图，`dataMember`选择行成员，`field`定位定义字段。省略视图键时继承父级数据上下文，默认成员为当前行；集合成员不退回当前行。`columns`和`functionContext`只描述可编辑的条件字段和函数候选。`format=tree`写原生树，`spark-json`写数据库过滤文本；二者清空分别为undefined和空字符串。写入经过同一DataView字段权限和编辑域，组件不执行被编辑条件、不保存数据库或文件。切换视图、行、字段或写权限后旧弹框失效；候选更新保留弹框和草稿，旧应用回调失效，下一次应用按最新候选校验。坏配置保留并诊断。原生设计页的模型、命名视图和关系配置复用它，保存通过所属DataView/DataSet提交，原存储owner仅在数据层资源适配内部执行IO。
