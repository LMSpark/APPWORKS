# 目录初始查询竞态只读诊断

## 结论

现象符合初始化查询与用户筛选查询竞争，入口上同时存在“查询按钮尚未禁用”。页面脚本没有把初始化纳入 `catalogOperationBusy`：`__init__` 顺序等待应用选项请求，再无条件以未过滤参数查询目录；`RenderCatalogSearch` 的按钮只有 `onClick`，没有 `disabled`。因此用户可在初始化未结束时提交筛选。

若用户筛选请求先完成，而应用选项请求之后才完成，`__init__` 随后启动的目录初始请求会成为更新请求并回写 10/1185。筛选 ID 留在脚本输入状态，因为输入状态与 DataView 的查询过滤状态是分开的。等初始化完成后再次查询，筛选请求成为最新请求，结果为 1/1。这个时序与主控提供的浏览器现象吻合。

## 源码证据

- `config/pages/data-platform/data-space-catalog/script.js:30-35`：`__init__` 先 `await apps.loadFromServer(...)`，之后无条件 `await view.loadFromServer(...)` 加载目录；初始化过程中没有忙状态标记或当前查询保护。
- `config/pages/data-platform/data-space-catalog/script.js:38-42`：用户筛选只受增删改/复制使用的 `catalogOperationBusy` 和保存未知标记阻挡。初始化期间前者未设置。
- `config/pages/data-platform/data-space-catalog/script.js:585-592`：筛选输入和查询按钮没有跟随初始化禁用；查询事件直接调用 `applyCatalogFilter`。
- `packages/spark-data/src/data-view.ts:1306-1308`：`loadFromServer` 仅当视图此刻恰为 `Loading` 才返回 `Already loading`，没有把初始化和用户请求合并为一个意图。
- `packages/spark-data/src/data-view.ts:1475-1478, 2297-2318`：`executeFilter` 在过滤条件改变时走 `setFilter → refresh → requestData`；请求序号保护的是先后启动的请求，后启动的初始目录请求可以成为最终写入者。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts:650-671`：已有 mounted 页面用例验证“更早发起的请求不能覆盖较新的结果”，但没有覆盖“用户筛选完成后，初始化流程才启动无过滤请求”的反向启动顺序。

## 既有测试边界

- `tests/runtime/page/catalog/data-space-four-file.test.ts:187-237` 的 `createCatalogScriptFixture` 已装载 PageRuntime，并在返回前 `await functions['__init__']?.()`；所以这里的筛选用例（约 856、1143 和 1226 行）只能验证初始化完成后的筛选、忙锁和过滤保持，无法触发本次早期交互时序。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts:470-530` 在 mounted 页完成初始化后才输入并提交筛选，验证过滤表达式和分页保持；同样未覆盖初始化中可点击。
- 低层 DataView 测试证明请求结果按请求序号淘汰旧响应，但目录脚本启动顺序是另一层的竞态；已有保护不会阻止初始化后发出的无过滤查询取胜。

## 最小修正建议

只需改 `config/pages/data-platform/data-space-catalog/script.js`：引入页面初始化状态，`__init__` 从开始到 `finally` 都保持 pending；`RenderCatalogSearch` 保留输入可编辑，并在 pending 时禁用“查询”按钮。初始化完成后按钮恢复，用户可直接用保留的 ID 提交筛选。不要只依赖 `catalogOperationBusy`，因为当前初始化不会设置它；也不要把初始目录加载和后续作者查询笼统归成一个数据请求状态。

## 有效回归测试建议

在 `tests/runtime/page/catalog/data-space-four-file.test.ts` 增加真实 SparkPageRenderer 挂载用例：让 `Base_AppSystemList` 初始化请求通过可控 deferred gate 挂起；此时输入已知目录 ID，断言输入值保留且“查询”按钮 disabled；释放 gate 并等待 `__init__` 的目录及作者请求结束；再提交筛选，断言最终列表只含目标 ID、分页显示 `1-1 / 1`，且最后一条 Base_DataSet 请求带 rowid 等值过滤。这个测试同时验证防止早期请求竞争和初始化后仍可查询。

只在初始化完成后直接调用 `applyCatalogFilter` 的测试不足以复现此问题；只断言按钮属性也不能确认初始化后的过滤查询仍能返回 1/1。

## 执行边界

本次只读源码和测试，没有修改代码、没有运行测试或浏览器操作。初始化与查询具体先后时间来自主控提供的复现描述；上述竞态路径由当前源码时序和 DataView 请求序号行为推导，尚未增加 gated regression 作运行验证。
