# 关系过滤表达式的祖先引用贯通

状态：implementing；持续授权的同一总计划。须等 expression-context 两文件冻结后再实施，不能并写多个闭环。

## 事实与业务结果

原关系编辑器允许全部祖先的 GetTableField（Field=注册模型名.正式字段名），现目录闭环恢复这项语义。主控进一步核到：LowcodeModelRelationAdapter.translate 在该函数分支只容许 parentResourceName 或裸字段，其他祖先被诊断后整条运行关系丢弃；ResourceRelationDefinition 的 renameTable/renameField/referencesField/referencesTable 只识别直接父 GetTableField，导致第三模型引用失去结构保护。这不符合完整过滤表达式真源。

结果应为：关系定义完整装配与往返，真实绑定的祖先引用转换到其稳定表/字段名；结构改名同步维护、删除受引用对象明确拒绝。求值上下文仍只有直接父和子时，祖先引用明确失败，不偷用同名父字段、当前视图或猜选中行，不让不支持本地求值反过来删除定义。

## 精确范围

1. src/lowcode/data-space/lowcode-model-relation-adapter.ts：GetTableField 复用既有注册模型唯一解析与字段转换；保留裸/直接父既有语义。
2. tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts：祖先限定引用、未绑定引用、身份碰撞与歧义、完整复合树、原输入不变。
3. packages/spark-data/src/resource-relation/resource-relation-definition.ts：GetTableField 的具名模型引用识别及表/字段改名、删除保护；集中现有责任方。
4. packages/spark-data/src/tests/dataset/dataset-crud-tool.test.ts：通过真实 DataSetCrudTool 验证第三模型/字段改名、删除保护、与裸直接父及自关联共存、序列化重开。
5. packages/spark-data/src/tests/computed-columns.test.ts：真实现有消费者缺少祖先上下文时明确失败，不产生错误匹配/聚合数；不新增公开求值 API。

本目录 expression-reference-result.md 与日志允许记录。若已有更准确测试文件应先报主控，不自行新增文件或扩至 DataSetCrudTool/Dataset 生产方法。主控已读其现有调用链：所有关系经过 ResourceRelationDefinition，不需再造第二遍历。

## 决策及边界

- 参考固定 SHA 与 AGENTS 原则沿 expression-context-brief.md；不动 UI/保存/布局/后端/在线数据，不派子代理。实施前完整读取当前目标及直接调用文件；保留字节基线，不重置混合工作树。
- 正式 GetTableField 裸字段仍属于关系直接父；直接父的限定名继续可归一到现有裸 canonicalName，保证既有运行兼容。
- 第三模型限定名只按注册 Name 唯一解析，稳定表名与物理来源不是注册别名。唯一真实绑定时保持限定名，换成 stableTable.canonicalField。不存在绑定时保留外部限定引用和定义；撞上另一稳定表身份或正式名不唯一时沿现有 diagnostics 明确拒绝该条运行装配，不静默选首项。未知字段拒绝，不捏造元数据。

主控复审澄清：上述“撞上另一稳定表身份”仅指没有正式名绑定的外部字符串，却与本地稳定表同名，可能被误解释的情形。若正式 Name 已唯一解析，必须按这个正式身份翻译，即使字符串恰好也是另一张本地表的 key，也不能因此拒绝合法定义；两个命名空间不能混为一谈。恢复原 resolveBoundModel 在正式唯一匹配时的行为，不扩大 GetRefData/GetGroupData 的拒绝条件。新增用例应证明唯一正式名优先转换到它的稳定名、外部未绑定碰撞仍拒绝，不固化过度限制。

主控复审补充：GetTableField 的限定模型识别须与适配器/createMatcher 一样按最后一个点分隔，不能只 startsWith(tableName + '.')；本仓表名仅要求非空，没有禁止点号。存在 Ancestor 与 Ancestor.Part 时，重命名/删除前者不能误伤对后者的引用。只在现有 ResourceRelationDefinition 统一修识别，并在现有 CrudTool 测试验证精确限定名；不新增 API。
- ResourceRelationDefinition 将具名 GetTableField 纳入与 GetRefData/GetGroupData 一样的第三模型引用维护。裸字段只有直接父有归属；限定引用必须精确匹配模型/字段，不改常量对象中的相同字符串。自关联同一叶子的 LHS/RHS 均需正确维护。
- 不修改 normalize 的完整过滤树承载，不把元数据改名推导成前端输入级联。不增加第三行/命名视图选择等未经确认的求值规则。
- createMatcher 现有严格限定名校验保持；新增测试证明真实计算列消费者拒绝祖先引用而不是返回错误聚合。沿现有失败通道，不把 undefined 解释为已具备生产错误提示。

## 验证

先补适配器和真实结构 CRUD 反例，留 red 日志；第一处修复立即跑其对应最小用例，再修另一处。最终跑宿主适配器单文件、spark-data 包的 dataset/dataset-crud-tool.test.ts 与 computed-columns.test.ts；再包级 typecheck、精确 ESLint。主控冻结后根 typecheck 和 ai-codegen，避免每个小改动重复全仓。原 647 项通过证明历史范围，不能替代新增行为验证，也无需无变化重复宿主 API/页面套件。

回报准确变更、测试条数、错误行为与原输入保留证据，并冻结。整页和全仓目标仍未完成。
