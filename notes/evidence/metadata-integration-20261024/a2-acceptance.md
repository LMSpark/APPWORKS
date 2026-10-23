# A2 模型工作区联合保存与恢复验收

- 日期：2026-10-24（Asia/Shanghai）；基线 `53a229cfbd04899c255e2e56574fc73473b43108`。
- 实施者：gpt-6-luna；主控负责派工、设计裁决、独立检查、真实烟测及唯一台账。
- 当前状态：A2 本组实现、3轮复审及真实保存/重开/恢复烟测完成；阶段A继续。本记录不表示整页、跨实例未知恢复或整平台已完成。
- 范围：模型、字段、来源入参、字段删除的同一原批次恢复。保留领域预检和单次 DataSet 提交，不全局清除未决状态、不重放未知写入。原有领域 session 状态仍有保留，不宣称全部通用状态已删除。

## 已完成检查

临时日志均位于 `node_modules/.cache/metadata-integration-20261024/`。

| 检查 | 结果及版本范围 | 日志 |
| --- | --- | --- |
| 第2轮 UI 恢复回归 | 16 passed / 327 skipped | a2-r2-controller-ui-equivalent.log |
| 第2轮迟到修改保护 | 3 passed / 58 skipped；包含在字段删除完整文件内，不重复累计 | a2-r2-field-removal-late.log |
| 字段删除完整回归 | 第1轮61/61；第2轮仅重测上述3项相关反例 | a2-r1-field-remove-full.log |
| 来源参数批次 | 第1轮15/15 | a2-r1-source-input-batch-full.log |
| 主键工作区 | 第1轮20/20 | a2-r1-primary-workspace.log |
| 数组与其他直接编辑影响面 | 第1轮9文件357/357 | a2-r1-controller-affected.log |
| 标准 typecheck、改动文件 ESLint | 第2轮均 exit 0 | a2-r2-typecheck.log、a2-r2-lint.log |
| 主控 verify:rules、build:fe | 第2轮均 exit 0；既有规则/依赖构建警告保留 | a2-r2-controller-rules.log、a2-r2-controller-build-fe.log |

第1轮完整影响检查曾有7项失败；修复后对应 source-input-batch/field-removal 文件通过。第1轮主控14项 UI 有5项失败；第2轮16项覆盖原14项及2个 owner-only 入口，均通过。它们是修复过程，不能将早期失败记录删除，也不能累加重叠通过数成为全仓结论。

独立复审第1轮发现纯删除缺少 model capture 时提前丢草稿；第2轮发现已确认后无法显式放弃点击前草稿。两项均已修正并复审通过，等待期间新增的 editing overlay/native diff 仍受保护。报告保留于 cache 的 `a2-review-report.md`、`a2-r1-review-report.md`、`a2-r2-review-report.md`。

第3轮修复跨页签入口，生产变更仅顶栏选择已有工作区的规则；模型、字段、来源入参、删除仍复用原联合协调器，未加载字段不被强行加载。`a2-r3-recovery-ui.log` 14 passed / 332 skipped，包含3项新增入口/未知回执用例及原恢复回归；不与前述重叠用例累加。标准 typecheck、scoped ESLint、主控完整 `pnpm run lint`、`verify:rules`、`build:fe` 均退出0，日志前缀 `a2-r3-`。第3轮独立复审无 Critical/Important/Minor，报告 `a2-r3-review-report.md`。

因第3轮同时修正联合回执 fixture，主控补跑该轮14项未包含的原5项 UI（invalid receipt、采用当前结果期间第二视图编辑、lost combined receipt、统一字段保存、字段表绑定），5 passed / 341 skipped，日志 `a2-r3-controller-remaining-ui.log`。最终两次不重叠筛选共19项 UI 通过；仍未运行整个346项页面文件。新增证据文档通过 `verify:docs`，394文件，日志 `a2-final-docs.log`。

## 第2轮真实页面烟测与发现

本地 Vite 连接实际服务；租户 NewApp，应用 `D99A1DCE9894698799101EFD70F8FC76`。从原导航的数据空间目录打开隔离空间 `944DEE5A0E5170F903E0E008172C4CD2 / LivePilot_T_20261017`，选择 `SourceScope_20261018`。

1. 原模型说明为“来源替换后连续保存已验证 20261018”，原 `ordIdx` 描述为“排序字段”。只编辑这两个描述，不修改身份、主键、输出、来源或其他模型。
2. 通过标准字段合同对话框和模型说明控件分别追加“；A2 smoke 20261024”；从字段工作区放弃本地修改后，两个值均恢复原文，保存禁用。
3. 再次暂存两个描述，在“3 字段呈现”点击顶栏保存，返回“本次字段配置已批量保存”。关闭模型配置及整个设计器，从目录创建新设计实例，两个描述均包含完整标记。字段截图见 `a2-smoke-reopened.png`；模型长文本以实际 AX 值为依据。
4. 恢复两个原值，切到“1 模型结构”点击顶栏保存，模型说明显示已保存并回读，但字段草稿仍在，关闭按钮禁用；切回字段页签保存仍启用。源码确认顶栏按页签调用 `modelEditor.save([])`，漏收集已加载字段。此为第3轮必须修复的真实缺口，不能用字段页签通过替代该入口验收。
5. 为恢复测试数据，从字段页签提交剩余字段原值，收到批量保存完成提示。关闭整个设计器并再次从目录新建实例，模型说明和 `ordIdx` 描述均逐字等于原文，保存禁用、关闭可用。截图见 `a2-round2-smoke-restored.png`。

该轮真实 UI 保存3次：联合写入1次、仅恢复模型1次、补恢复字段1次。没有独立统计底层 HTTP 写次数。线上未注入未知响应或部分成功，这些异常依据自动化反例；跨刷新、重新登录的未知恢复仍待验证。

## 第3轮真实入口复测

1. 重新从目录打开 T，确认模型说明与字段描述都为原值。通过字段合同对话框暂存 `ordIdx` 描述，再切到“1 模型结构”暂存模型说明。
2. 在“1 模型结构”仅点击顶栏保存一次；完成后保存禁用、关闭可用。关闭整个设计器，从目录创建新实例，模型说明和字段描述都包含完整烟测标记，字段工作区无待保存修改。截图 `a2-source-tab-reopened.png`。
3. 同样先恢复字段描述，再切到“1 模型结构”恢复模型说明，从该页签仅点击顶栏保存一次。完成后关闭整个设计器，第三个新实例逐字核对两个原值，均为 true；保存禁用、关闭可用。截图 `a2-source-tab-restored.png`，安全结果摘要 `a2-source-tab-smoke.json`。

第3轮共2次真实 UI 保存动作，修复后的同一 source 入口完成联合写入与联合恢复；没有依赖额外字段保存来补齐。测试标记全部恢复，保留原 `RetirementProbe_20261018` 字段。未知/部分失败仍只由自动化反例证明。

## 独立正式运行消费

烟测数据恢复后，在独立进程调用现有 `loadLowcodeRuntimeScenario`，从实际服务读取 T 的正式配置，装配原 DataSet，再通过 `SourceScope_20261018@default` 的 DataView 查询，得到4行。其余3个未查询视图的请求状态、行数和配置哈希保持不变。没有执行保存，未输出业务行值或身份凭据。

安全摘要见 `runtime-consumption-readonly.json`，完整本地日志为 `runtime-consumption-readonly.log`。此证据是单空间正式 DataView 运行查询；不证明标准组件双空间绑定，也不证明设计保存前后未加载记录完整保留。Node 脚本使用进程内会话存储和现有公开请求拦截器提供本地网关 origin，产品实现未为脚本放宽合同。
