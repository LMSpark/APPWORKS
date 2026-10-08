# 字段输入选项查询局部闭环

状态：本轮独立选项查询前提已验收。完整输入级联仍待接入。

三文件前像与 SHA256：`before/`、`before-hashes.json`；最终 SHA256：`after-hashes.json`。未提交、未建分支、未做线上写入。

主控最终验证：`root-final-typecheck.log` 退出0；`root-final-ai-codegen.log` 通过1012文件；`root-regression.log` 5套182/182通过。首次 typecheck 的可选 filter 属性错误经原 writer 最小修复，最终根类型重跑通过。审查两项局部修正后的两套44/44与精确lint见 `review-final-tests.log`、`review-final-eslint.log`，原42项记录为修正前历史。

独立最终审查见 `.superpowers/sdd/plan-data-space-metadata-dataset/input-options-review.md`；合法 __proto__ 输出丢失已修复，原独立探针1/1通过；nested源配置下临时发flat且源引用不变有正式回归。主控校验3个当前SHA均匹配after清单，`root-final-hashes.json`和`input-options-final.patch`保留精确交付范围。没有线上请求，不将传输夹具验收声称线上全量行为。本轮没有新增数据库或文件格式，Java/UI未改；未完成整个DataSet/AppWorks目标。

原生 `DataView.queryOptionRows(options)` 通过已有正式查询 owner 取得完整候选行，临时视图只在本次请求内持有结果和权限，并委托原视图身份执行查询。输入字段预检、全量计数、h/m 权限、计算列可见性、标量值、源配置与代次失效均已纳入。临时挂载不写共享 DataTable.columns 或 views；计算上下文独立复制且限制为可精确比较的 JSON 值。

真实验证：

- 最小红：`red.log`，新增方法缺失导致 1 失败、原 21 通过。
- 首次生产修改立即绿：`green.log`，22/22 通过。
- 最终两套聚焦：`final-tests.log`，42/42 通过。
- 精确三文件 ESLint：`final-eslint.log`，退出码 0；日志为空。
- `git diff --check`：退出码 0。

根类型检查在首次冻结后发现 `filter: undefined` 与 `exactOptionalPropertyTypes` 冲突（`root-typecheck.log`）。已仅将可选 `filter` 改为有值时展开；`type-fix-test.log` 中方法最小用例 1/1 通过，`type-fix-eslint.log` 中精确三文件 ESLint 退出码 0。最终哈希已更新；根 typecheck 复验由主控执行。

独立审查确认两项同范围缺陷：合法 `__proto__` 字段写入普通对象时丢失；嵌套树源视图会覆盖请求参数中的 `flat`。`review-red.log` 的两个新增原生用例均失败，修正后 `review-green.log` 2/2 通过。最终 `review-final-tests.log` 两套聚焦 44/44 通过，`review-final-eslint.log` 精确三文件 ESLint 退出码 0，`git diff --check` 退出码 0。选项行现在以自有属性保留合法字段；临时视图自身设为 flat，原视图树配置未改变。最终哈希再次更新。

真实 DataSpaceRuntimeApi 用例覆盖正式 Name 请求、canonical alias 回读、GetInputParam 本次父值、h/m 与本地计算读取，原视图 rows、编辑 patch 和 queryContext 保持不变。后续字段级联 owner 尚未接入；本轮不宣称字段级联完成。根 typecheck、AI codegen 与相关回归由主控执行。
