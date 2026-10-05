---
name: appworks-debug-problem
description: 当 SPARK AppWorks 出现 typecheck/lint/test 失败、verify:* 门禁失败、构建报错、Agent Workflow 或 ClassModel 异常、页面四文件（rule.json/pagedata.json/script.js/style.css）或项目模型行为不对、前端白屏或数据不对，且用户要求定位、排查、找根因、"为什么会这样"时使用。
---

# 诊断 AppWorks 问题（只读）

用最小的可证伪证据找出根因，不改变被调查的系统。诊断可以止于"根因 + 修复任务单"；是否修复由用户另行决定，并回到根 `AGENTS.md` 七阶段。

## 边界

- 默认只读：不改代码、不 `git add/commit`、不清全局缓存、不重启无关服务、不加会改变行为的日志。
- 不顺手修复。用户中途说"那就修吧"，立刻停止诊断，转入根 `AGENTS.md` 阶段 1（研读复述 → 复杂度分级 → 提问 → 方案 → 审核），不得直接编码。
- 不把本次任务之前就存在的脏文件或失败归因给当前症状；先 `git status` 记录基线。
- 证据中出现密钥、Token、个人数据时脱敏，不写进报告。

## 流程

1. **复现**：用最小且安全的命令或浏览器路径复现。无法安全复现时，写明原因，不编造根因。
2. **读真相**：完整阅读涉及的源文件及其调用方、测试、配置、包导出。按 `knowledge/README.md` 决策表读取对应知识文件。代码是真相，测试不一定正确。
3. **定位最低所有者**：按下表把失败归到最低一层，只展开被证据指向的域。
4. **列可证伪假设**：每条假设写明"什么证据支持、什么证据推翻"。
5. **只读判别**：用只读检查区分假设。只改变一个因果变量，不霰弹式试错。
6. **确认根因**：只有证据能排除其他可信假设时才算确认；否则报告"有界未决假设"和还缺的判别检查。
7. **出修复任务单**：最小修复、受影响的所有者与消费者、回归测试、验收标准。

## 判别技巧

- **沿调用链反向追**：症状出现的位置往往不是起因。从报错点开始问"谁调用了它、传了什么值"，逐层向上，直到找到最初产生坏值的位置；修复也应落在源头。只读阶段靠读代码和已有日志/测试输出追踪；加临时日志属于改动，须在方案批准后进行，且只用于取证。
- **不穿透、不跳层**：多层系统（ClassModel 生成 → 工作流定义 → 运行时 → 编辑器）先确认数据在每个层边界进出时的样子，找出第一个出错的层，再深入那一层。
- **不稳定测试先怀疑固定等待**：测试里用固定 `sleep`/`setTimeout` 猜时序时，把"改成等待具体条件（带超时和明确报错）"写进修复任务单；只有测试的就是时间行为（防抖、节流）时才允许固定等待，并写明理由。
- **逐个测一个变量**：一次只改变一个因果变量，改变后立刻观察，不叠加多个猜测。

## 失败域（本仓已核实路径）

| 域 | 起点 | 注意 |
| --- | --- | --- |
| 构建/类型 | `pnpm run typecheck`（`vue-tsc -p tsconfig.typecheck.json`） | 先找第一个因果错误，不修级联错误；记录实际使用的 tsconfig |
| Lint/规则门禁 | `pnpm run lint`、`pnpm run verify:rules` | `verify:rules` 可能被既有 `verify:arch` 阻断，需拆项定位，见 `knowledge/testing.md` |
| ClassModel | `generated/dts-class-model/`、`packages/spark-ai/src/class-model/` | 改过模型 class/JSDoc 后需先 `pnpm run generate:class-model-surface`，否则读到旧生成物，见 `knowledge/class-model-system.md` |
| Agent Workflow | `packages/spark-ai/src/agent/workflow/`（definition / validation / runtime / dry-run）、`src/services/workflow-designs.ts` | 区分定义无效、运行时激活失败、工具调用被门禁拒绝、工具循环空转 |
| 页面设计 / 项目模型 | `packages/spark-project-model/`、`knowledge/page-design.md` | 区分内存态与落盘态；dirty 不等于已保存 |
| 前端运行 | `src/`、`packages/spark-component/`、`packages/spark-data/` | 区分路由、组件解析、数据绑定、缓存；见 `knowledge/vue-frontend.md` |
| 包依赖/构建产物 | `packages/*`、`pnpm run build:packages` | 区分源码问题与 `dist` 过期，见 `knowledge/monorepo-dependencies.md` |

## 输出：诊断报告

直接用 Markdown 输出，不要写文件，除非用户要求：

```markdown
## 诊断报告
- 模式：diagnosis-only（changedFiles=[]）
- 症状与复现：命令/路径 + 实际结果 vs 预期结果
- 基线：git status 摘要、既有失败
- 失败域与最低所有者：
- 假设表：假设 | 支持证据 | 排除证据 | 状态（confirmed/rejected/open）
- 根因：第一处偏离的 文件:行 + 证据（或"未确认：缺 X"）
- 修复任务单：最小改动、影响面、回归测试、验收标准
- 建议路由：是否需要走 AGENTS.md 七阶段
```

## 修复连续失败的升级规则

当用户已批准修复方案并实施，但同一问题的修复尝试累计失败 3 次（每次修复都暴露新的耦合或在别处产生新症状）：

- 停止，不做第 4 次尝试，也不扩大改动范围。
- 向用户回报：已尝试的路径、每次的验证输出、失败暴露出的共同结构问题（共享状态、层间耦合、边界归属错误）。
- 这说明原方案前提可能错误，按根 `AGENTS.md` 回滚策略回到阶段 2（补充提问）或阶段 4（修订方案），由用户决定是否调整架构。

## 证据标准

确认根因需要：已复现的症状、被证据支持的假设、被排除的可信替代假设、最低所有边界、以及一个只改变因果变量的检查。缺任一项，只能报告有界假设。
