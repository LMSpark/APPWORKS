# 关系表达式祖先引用贯通结果

状态：已冻结，待主控根级门禁与总体验收。

## 精确改动

- `LowcodeModelRelationAdapter` 对具名 `GetTableField` 复用正式注册 Name 的唯一解析：真实绑定转换为 `stableTable.canonicalField`，未绑定外部引用原样保留；裸字段和直接父限定名仍归一为父字段的裸 canonicalName。正式名唯一时优先正式绑定，即使同字串也是另一稳定表 key；仅无正式匹配而碰撞稳定 key、正式名歧义或绑定模型缺字段时诊断拒绝；原过滤树不变。
- `ResourceRelationDefinition` 对具名 `GetTableField` 按最后一个点精确识别表/字段引用，支撑第三模型字段与表改名及删除保护；`Ancestor.Part.key` 不会被误认作 `Ancestor`。裸字段仍只属直接父，自关联同一叶子两侧继续维护，常量字符串不改。
- 既有 `createMatcher` 仍仅有直接父/子行上下文；真实计算列聚合在遇到祖先限定引用时明确报限定名不匹配，结果未设置，不产生错误聚合数。没有扩展求值规则或错误 UI。

## Red/green

- 初始红例：`expression-reference-adapter-red.log`，2 失败/13 通过；祖先及外部具名引用被误拒。`expression-reference-crud-red.log`，1 失败/12 通过；第三模型字段删除未受保护。
- 第一处修复后 `expression-reference-adapter-green.log`：15/15。第二处修复后 `expression-reference-crud-green.log`：13/13。
- 原 `expression-reference-identity-red.log`/`expression-reference-identity-green.log` 曾按过宽的稳定 key 冲突判断留证，主控复审后已纠正，该断言不再是最终合同。
- 复审红例：`expression-reference-review-formal-priority-red.log`，1 失败/14 通过，正式 Name 被过宽守卫拒绝；`expression-reference-review-dotted-qualifier-red.log`，1 失败/13 通过，点号前缀表误改限定名。两项分别修复后 `expression-reference-review-formal-priority-green.log` 为 15/15，`expression-reference-review-dotted-qualifier-green.log` 为 14/14。
- 既有计算消费者：`expression-reference-computed.log`，92/92。

## 冻结验证

- `pnpm exec vitest run tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts`：15/15，通过，`expression-reference-review-final-adapter.log`。
- `pnpm --dir packages/spark-data exec vitest run src/tests/dataset/dataset-crud-tool.test.ts src/tests/computed-columns.test.ts`：106/106，通过，`expression-reference-review-final-spark-data-tests.log`。
- `pnpm --dir packages/spark-data run typecheck`：exit 0，`expression-reference-review-final-spark-data-typecheck.log`。
- 执行者报告精确五文件 ESLint exit 0，但所列 `expression-reference-review-final-lint.log` 未落盘；主控因此复跑五文件 ESLint，exit 0，实际日志为 `expression-final-reference-lint.log`。
- `git diff --check` 对精确五文件 exit 0；仅有现有 Git 换行转换提示。目录页面两文件未改。本轮未提交、未建分支、未写线上数据。

主控最终根类型和 AI 代码门禁均通过，见 `expression-final-root-typecheck.log`、`expression-final-ai-codegen.log`；主控限定验收见 `expression-review.md`。本轮不声称整页或全仓验收已完成。
