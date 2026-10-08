# ClassModel 脚本参数引用修复

2026-10-09；主控直接实施。此文件接续 result.md 的失败核查，不将本闭环等同完整集成完成。

## 已改范围

五个文件：三个生产文件、两个既有测试文件；新增生产文件一个。无公开业务API、依赖、Java、线上数据或业务设计页变更。

- `class-model/class-model/schema/class-model-runtime-schema.ts`：仅从已加载声明收集当前参数可达的定义，将同分片/跨分片引用绑定到独立参数资源；递归引用保留为引用，不展开模型；局部同名定义按声明作用域解析，不变更literal/default。缺失定义明确失败。
- `class-model/class-model/dts-surface-to-runtime-api.ts`：构造及动作参数通过上述内部类附上所需定义。
- `agent/native-runtime/native-script-context.ts`：单对象参数识别支持参数资源的引用；缓存观察Promise不再产生重复未处理拒绝，原失败仍传到脚本结果。
- `class-model/tests/dts-surface-to-runtime-api.test.ts`：声明→bundle→loader→真实执行器跨分片/递归参数成功及无效格式、缺失字段、嵌套类型拒绝；局部作用域与字面值保留、缺失定义拒绝。
- `tests/script-runtime/ai-api-script-context.test.ts`：await失败结果仍报告原错误且无额外未处理拒绝。

原计划预留的loader文件未修改：本闭环实际参数依赖已由现有闭包加载；后续生成器改正联合/交叉投影后，需重新验证闭包可达性，不凭预期先扩写loader。

## 验证

- 开工typecheck通过；当前精确版本typecheck、五文件Lint、AI1025门禁和限定diff-check通过。
- 新回归先红后绿；局部作用域测试先暴露引用位置污染声明作用域，修正后通过。
- Promise失败回归的首个夹具被已有API metadata约束拒绝，修正夹具后真实复现“断言通过但存在未处理拒绝”；修复缓存观察分支后通过。
- 相关18套件201项通过，17.33秒；之后仅替换schema定义容器的清空方式以满足Lint，再跑最小3项通过；当前typecheck及Lint已复核。
- 生成器增量刷新成功（1362模型，16.735秒），guide JSON Schema结构门禁通过；语义缺口总数仍2290，与本闭环开始相同，全仓语义门禁仍未清零。
- 全量首轮：211套件，2768通过/1既有设计页用例5000ms超时，197.88秒；保留 root-first-with-compilation.log。当轮曾与类型检查/生成并行，不将其归因认定为代码或环境。单独复验该用例3.65秒通过，未更改超时/断言，保留 design-isolated.log。
- 独立全量复验：211套件2769项全部通过，196.68秒，进程退出0；见root-final.log。没有并行编译，没有改动原5000ms阈值/断言。五路径最终哈希保持一致，本参数引用闭环验收通过；完整配置链仍未完成。

## 真实配置链核查

probe-runtime.mts.txt保留当前实际复现脚本，输入是明确命名的本地夹具。

- executeDtsNativeScript → DataSetCrudTool.createCascade/getCascade已通过，输出valueFormat为selection-string；同实例实际级联与输入完整相等。
- 该定义经ScenarioViewFile校验，写本地fixture文件并独立重新读取，views中的valueField/selectionDelimiter及级联原格式保持；这不是线上owner保存成功的证据。正式保存owner的既有夹具已纳入18套件回归。
- 旧rowMode定义被拒绝，现有级联未改变，无未处理Promise拒绝。
- **updateCascade仍未通过**：TypeScript参数是选择器与updates的交叉类型，但生成的DataSetCrudToolUpdateCascadeParams只有updates字段，cascadeId被误判多余。update-schema-blocker.json保留真实失败；生产动作没有执行，原级联不变。本轮没有通过删字段/放宽additionalProperties或直接调用绕过这个失败。
- 另记录：原先直接返回整个DataViewCascade的脚本结果是空对象（结果代理的序列化边界）；当前通过明确读取valueFormat验证消费及实际实例状态，不能据此声称DTO返回序列化完整。

## 下一闭环事实锚点

`project-from-declarations.ts` 的projectTypeAliasDeclaration只在无attributes/methods时保留完整objectSchema；交叉类型有updates属性时退回成员投影，从而丢失引用选择器。`dts-type-schema.ts`目前只做语法映射：Partial对引用占位符移除required没有表达真正Partial，paramsSchema未记录required；bundle的类型别名根schema也仍可能保留title占位符。下一闭环先完整研读直接消费者和测试，再修订精确方案，不能把本次运行引用修复当作编译声明语义已完整。

完整AppWorks集成、设计器及线上旧配置核查仍未完成。整体目标保持active。
