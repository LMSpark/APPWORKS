状态：superseded

> 已由 `notes/plan-workflow-edge-routing-controls-and-status.md` 替代。

## 任务目标

为工作流设计器增加每线独立的正交、直线、贝塞尔线型，支持 12 个编号接线点与 `dock=0` 最近接点，并建立不伪造运行事实的五态连线视觉输入边界。

## 明确排除

- 不修改导航、数据资源、字典、关系或数据空间元数据。
- 不修改后端 SSE 协议，不生成虚假的节点级运行事件。
- 不把设计线型写入 `definition.json`，不改变工作流执行语义。
- 不新增依赖，不调整现有自动排版算法。

## 影响范围

- `src/services/workflow-designs.ts`：增加设计态线型元数据；规范化旧端点 `dock`；提供线型读写窄函数；definition 投影排除视觉元数据。
- `src/views/app/WorkflowDesigns.vue`：增加 12 个编号 Handle、自动最近接点、逐线型渲染、右侧线型下拉框和五态运行视觉输入映射。
- `tests/services/workflow-designs.test.ts`：覆盖默认线型、`dock=0`、旧稿规范化、线型更新和 definition 隔离。
- `tests/views/workflow-designs.test.ts`：覆盖端口编号与方向、三种线型、切换保存、固定/自动 dock 和五态视觉映射。

## 技术方案

1. 在 `line.data` 下收束独立视觉元数据，不复用可能承载业务含义的 `line.type`。
2. 使用 `orthogonal | straight | bezier`；旧稿无值时读取为 `orthogonal`。
3. `dock=1..12` 固定映射 Handle；`dock=0` 在右/下 source 与上/左 target 候选中计算距离最小组合。
4. Vue Flow 按边映射 `smoothstep`、`straight`、贝塞尔默认类型；新建预览默认正交。
5. 右侧下拉框修改当前连线视觉元数据并标记 graph lines dirty。
6. 建立 `idle/running/completed/failed/skipped` 到 class、动画、颜色和图标的单向投影入口；当前不接不存在的节点级 SSE。
7. 保存前规范化所有主图及 loop/iteration 子图的端点 dock，旧稿缺失值写为 `0`。

## 关键设计决策及理由

- 视觉线型独立存储，避免覆盖既有 `line.type='custom'` 的潜在业务语义。
- `dock=0` 渲染时动态解析，节点移动后仍保持“最近接点”意图。
- 运行状态是瞬时事实，不进入设计稿或 definition。
- 当前协议没有节点级事件，禁止从 toolCalls 或整次 Host Run 状态猜测边状态。

## 兼容性

- 旧稿缺少 `dock` 或线型时可打开，分别按 `0` 和正交处理。
- 保存旧稿后端点显式写入 `dock=0`，其余未知字段保持不变。
- definition 的业务端点与执行顺序保持现状，不携带设计视觉字段。

## 验证计划

- 编码前基线：`pnpm run typecheck`。
- 最小闭环一：服务模型修改后运行 `pnpm exec vitest run tests/services/workflow-designs.test.ts`。
- 最小闭环二：页面端口与线型修改后运行 `pnpm exec vitest run tests/views/workflow-designs.test.ts`。
- 最小闭环三：五态视觉映射后再次运行页面测试。
- 最终按顺序运行：`pnpm run typecheck`、`pnpm run lint`、相关两份 Vitest、`pnpm run verify:workflow-designs`、`pnpm run verify:ai-codegen`。
- 人工验证三种线型重开保持、12 接点拖连、固定/自动 dock、节点移动、主图/子图及五态样式输入。

## 风险项

- Vue Flow 当前版本的贝塞尔枚举名需在实施前以本地类型导出确认。
- 多边共享 Handle 可能重叠；本次不增加自动避让。
- 最近距离依赖节点尺寸估算，需覆盖四象限测试。
- 运行态图标不得阻断 edge 点击区域。
- `WorkflowDesigns.vue` 已较大，本次不做计划外拆分重构。

## 回滚策略

- 每个最小闭环只改计划内文件并立即验证。
- 若当前 Vue Flow 无法稳定支持逐边线型或 12 Handle 重连，停止并回报，不引入新绘图库。
- 若必须新增后端事件或修改 definition 契约，停止实施并修订方案。
