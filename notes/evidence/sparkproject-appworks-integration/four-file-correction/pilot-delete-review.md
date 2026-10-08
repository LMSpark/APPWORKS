# 当前行删除闭环只读审查

审查范围：计划第五项、删除实施记录，以及当前 `script.js`、`style.css`、`data-space-four-file.test.ts` 相对 `delete-before/*.txt` 的差异。未运行测试、浏览器或后端，未修改样板源文件。

结论：删除主路径符合 d 权限、无角色分支、确认前不暂存、取消/切行/页面失效/脚本查询重入零写、单行原 owner 删除、未知结果锁、末页退页及筛选保留的实现意图。当前闭环仍有一个行为阻塞和两个验收覆盖缺口，不能判为通过。

## 阻塞：成功回执后的刷新没有核验目标 ID

- 位置：[script.js](/D:/SPARK_AppWorks/config/pages/data-platform/data-space-catalog/script.js:319)，刷新只检查 `loadingError` 后即提示“数据空间已删除”（322–325）。
- 复现条件：后端返回成功且 `deletedCount === 1`，但随后刷新因最终一致性/陈旧读取仍返回刚删除的 rowid。代码仍报告删除成功，目标行仍显示。
- 最小修复：在 `setPage`/`refresh` 与 `loadingError` 检查后，检查当前 `view.rows` 不含目标 ID；仍包含时按“删除已确认、刷新未反映删除”进入“数据空间已删除，刷新失败”提示分支。增加一项 fixture：删除回执成功、查询仍返回该 ID，断言不会显示成功提示。末页退页路径也要验证该断言。

## 验收缺口：未知删除锁用例没有验证其余写入口

- 位置：[data-space-four-file.test.ts](/D:/SPARK_AppWorks/tests/runtime/page/catalog/data-space-four-file.test.ts:478)，fixture 默认只有一行；删除暂存后 rows 为空。498–502 再渲染工具栏时编辑/删除按钮已不存在，`if (click)` 会跳过这两个断言。
- 代码检查：新增、编辑、删除处理函数入口分别有 `catalogSaveUncertain` 早退（script.js 91、183、281），且新增按钮 disabled、当前行写按钮由渲染状态控制。因此这是验收覆盖不足，未发现实际漏锁。
- 最小修复：令该 fixture 至少有两行，并在未知结果后断言三个操作入口均存在可调用 handler，再调用并断言没有新增确认/提示、保存请求仍为 1，且 pending-delete 保留。也可直接调用处理函数（编辑/删除给出保留的第二行），避免工具栏因当前行变化而跳过检查。

## 验收缺口：确认期间只测了页面脚本查询重入，没有测 DataView 查询替换

- 位置：[data-space-four-file.test.ts](/D:/SPARK_AppWorks/tests/runtime/page/catalog/data-space-four-file.test.ts:439)，452–454 只调用 `applyCatalogFilter`/`changeCatalogPage`，前者因 `catalogOperationBusy` 直接返回；这证明的是页面处理函数被锁，不是查询替换后的目标作废。
- 代码检查：[script.js](/D:/SPARK_AppWorks/config/pages/data-platform/data-space-catalog/script.js:8) 的 `catalogTargetIsCurrent` 通过 `view.rows.includes(row)` 和 currentRow 检查目标仍在当前结果中；若 DataView 的外部 `executeFilter` 替换结果并移除目标，确认后会拒绝暂存。若替换结果仍包含同一行对象且仍为 currentRow，现有目标检查会继续允许删除，不能证明“任何查询替换都取消”。
- 最小修复：按计划补一项确认期间直接对 view 执行会替换查询结果的测试，并断言零暂存/零保存。若产品契约要求即使新结果仍含同一行也必须取消，则需给目标校验增加查询代次/快照依据；否则将计划措辞收窄为“目标因查询替换而不再属于当前结果时取消”。

## 其余指定规格

- d 权限由 DataView 的 `deleteActionState` 驱动；fixture 的默认 `d:false` 拒绝确认/保存，`d:true` 用例检查单个 Deleted、无 Added/Changed；没有角色/admin 特判。
- showConfirm 前没有 `removeRow`；取消及确认中切行、页面失效不写。确认中页面脚本的查询/分页入口被 busy 锁拒绝。
- saveChanges 仅传 `Base_DataSet@catalog` 与单个 id；owner 删除回执检查 `deletedCount === 1`。未知结果保持 pending-delete 和共享写锁，不自动刷新或重发。
- 删除末页唯一行时先退页；DataView 持有当前 filter，代码未清筛选。但对应删除用例没有设置筛选，实际“保留筛选”尚无行为断言。
- 刷新失败用例覆盖查询抛错并显示“数据空间已删除，刷新失败”；未覆盖成功查询仍返回目标 ID（见阻塞）。
- CSS 仅新增删除危险色，未发现范围外行为。

## 定向复审（2026-10-08）

按主控要求，仅复核前述三项及其修复是否引入新问题；未运行测试，也未调用浏览器或后端。

1. **成功回执后核验目标 ID — addressed。** `script.js:323` 在刷新/退页后检查当前结果仍含目标 ID 时，写入明确的回读不一致错误并停止成功提示；测试 `data-space-four-file.test.ts:562` 模拟成功删除回执但陈旧查询仍返回目标，断言错误提示且无成功提示。符合原阻塞的最小修复。
2. **未知删除锁覆盖所有写入口 — addressed。** 测试 `data-space-four-file.test.ts:505` 配置两行，选中保留行后强制确认新增、编辑、删除 handler 均存在并逐个调用（534）；断言没有新增消息/额外保存且 pending-delete 保留。覆盖了此前被条件跳过的路径。
3. **确认期间 DataView 查询替换 — addressed。** 测试 `data-space-four-file.test.ts:479` 分别直接执行 `view.executeFilter(undefined)` 和 `view.refresh()`，确认当前行对象已替换后再确认删除，并断言目标仍在结果、无 pending-delete、无保存请求。对应目标身份检查拒绝过期确认。

本轮对上述新增代码未发现引入问题。三项原审查问题均已处理，**这三项定向复审可通过**。该结论只覆盖本次限定的三项，不替代主控要求的测试/根回归或其他范围验收。
