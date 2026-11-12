状态：implementing

## 任务目标
按本仓 SPARK data 统一链返工蓝图批次3b与批次4中所有绕过数据层的实现，删除被替代代码。

## 阶段与业务语义
- 阶段1 实服只读核验：桌面模型、桌面字典、`Bil_Dimension_Set` 的正式身份与列；宿主关系列；字段表列；导航字典。需用户手动登录，未核实部分阻塞。
- 阶段2 公共能力：spark-data 编辑时按 `optionsView.fill` 回填；spark-component 标准字段对 JSON 文本列按子键读写；必要时 FieldCheckbox 按列类型推导真假值。
- 阶段3 批次4：宿主改为 7AB pagedata 声明（列规则、optionsView/fill、field 与 query 级联、跨字段保存规则）；桌面并入 7AB pagedata；导航页签去掉手工权限与列类型推导。
- 阶段4 批次3b：三个编辑器与账套守卫改为 88A4 等正式 pagedata 的视图、级联、回填与列规则。
- 阶段5 验证与交付。

## 影响范围
- `packages/spark-data`（编辑时回填）、`packages/spark-component`（JSON 子键、复选框）。
- `config/pages/application/project-blueprint/pagedata.json`、`config/pages/structured-config/dimension-design/pagedata.json`；删除 `desktop-views.json`、`ledger-views.json`。
- `src/services/project/blueprint-navigation/*`、`src/views/features/application/application-function-management/ui/**`、`src/lowcode/resources/structured-config/dimension-source/*` 及对应测试。

## 技术方案
见研读文件的“用户决定”。公共机制无法表达某条业务时停下汇报，不回退到页面层实现。

## 验证计划
- `pnpm run typecheck`、定向 vitest、改动文件 ESLint、`pnpm run verify` 与附加门禁。
- 隔离浏览器烟测宿主、桌面、维度来源三条链；登录可用时实服只读打开核验。

## 风险
- query 级联不能读取编辑行值时，宿主字段候选需另定公共方案。
- 实服不可达时，依赖模型身份的部分保持阻塞。
