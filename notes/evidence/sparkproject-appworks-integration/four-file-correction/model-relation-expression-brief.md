# 模型关系完整过滤表达式：实施 brief

状态：本轮底座已验收，证据见 model-relation-expression-review.md；整页继续由主计划管理。以下保留本轮实施要求：依据主计划同名闭环和 AGENTS.md 0.5，目标是完整数据空间四文件页面所需关系运行合同，不是重建所有前端规则。用户持续授权低阶实施、主控验收、按长期利益裁决；不复制聊天，不派生代理。

## 目标与关键边界

模型关系定义稳定，但表达方式必须是完整过滤树。不得只保留 AND/eq/GetTableField；OR、非等值、常量、空值和正式值函数定义必须无损保留。模型关系不自动生成视图查询依赖，更不承担多父字段输入级联。DataSpaceDesignApi.readRelations 已返回完整 DataViewFilter，不能新增第二 codec。

运行与序列化条件唯一真源为 filterExpression: DataViewFilterTree。既有 parentField/childField/fieldMappings 配置确有本仓调用和历史快照，入口以一个受控归一过程转成等价树；运行关系/输出不得再保留另一套条件，拒绝同时输入互相冲突的表达式与映射。旧 condition 是未实现占位，不猜它的格式或悄悄忽略。保留来源 ID、关系 ID、端点及 cascadeUpdate/cascadeDelete 声明，不伪造服务端级联行为。

关系条件的 field 指向子模型字段；GetTableField.Field 沿现有正式关系协议指向父模型字段。限定名和正式 Name→canonicalName 的翻译必须按真实 readModel 定义，两侧不能混淆；常量字符串不得改写为字段。扩展函数内部不认识的字符串不猜字段引用。先核是否有合法非输出字段：保留其定义，不能因本地投影未包含字段就删掉整条正式关系；本地消费缺字段要明确失败。

## 精确允许文件

生产文件：

- packages/spark-data/src/types.ts：关系条件合同、输入归一边界所必需的具名类型、关系定位合同；移除运行关系对旧字段对的依赖，保持 DataSetContract 同步。
- packages/spark-data/src/index.ts：仅显式导出有实际调用者的新增合同，根包路径不变，不增 exports 子路径或别名。
- packages/spark-data/src/resource-relation/resource-relation-definition.ts（新增）：归属 ResourceRelation 的内部 class，集中条件归一/字段引用遍历与维护/父值代入，复用 DataViewFilter 和 DataViewFilterLocal，不导出到包公共面。根目录当前6个子目录，新增此目录为第7个。
- packages/spark-data/src/dataset.ts、metadata.ts：fromJson/constructor/replace/serialize 与关系增删改统一验证归一，关系ID消歧，失败不留下半个变更，结构索引和保存排序继续只依端点。
- packages/spark-data/src/dataset-crud-tool.ts：创建/更新/获取/删除支持表达式与 relationId；列/表改名按条件两侧作用域维护引用，删除被引用列拒绝；历史快照往返保持表达式，不扫改常量文本。
- packages/spark-data/src/strategies/computed-column-delegate.ts：已有聚合消费者通过关系表达式匹配父行/子行，复用既有本地操作符语义，不复制一套运算符引擎。保留现有字符串表引用的明确 default 语义；本轮不得用该路径声称覆盖其它命名视图。存在同端点多关系时拒绝隐式取第一条并清楚报错；下一闭环再落实显式关系/视图选择。未支持的服务端函数和缺字段不能回退等值/空集合/0；保留既有计算错误通道并在回报说明其用户可见边界。
- src/lowcode/data-space/lowcode-model-relation-adapter.ts：整个正式过滤树翻译为完整运行关系，不再因操作符或值函数类型丢关系。保留限定名身份校验及缺失正式字段诊断，不创建视图级联。
- src/lowcode/data-space/lowcode-data-space-assembler.ts：只在必要处更新关系装配合同/说明，不改视图绑定、查询或保存 owner。
- packages/spark-data/API.md：仅同步已改变的关系合同和真实本地执行限制；当前文件混合dirty，先保留字节基线，不替换全文。

测试文件（只能按上述合同变化和真正行为补验，不借机改旧测试的其它语义）：

- packages/spark-data/src/tests/dataset/dataset-structure-crud.test.ts
- packages/spark-data/src/tests/dataset/dataset-request-orchestration.test.ts
- packages/spark-data/src/tests/dataset/dataset-relation-rebuild.test.ts
- packages/spark-data/src/tests/dataset/dataset-json-prompt-validation.test.ts
- packages/spark-data/src/tests/dataset/dataset-crud-tool.test.ts
- packages/spark-data/src/tests/computed-columns.test.ts
- packages/spark-data/src/tests/cascade-computed-tree.test.ts
- packages/spark-data/src/tests/cascade-event-filter.test.ts
- packages/spark-data/src/tests/crud/commit-mode.test.ts
- packages/spark-data/src/tests/data-view/data-table-responsibilities.test.ts
- packages/spark-data/src/tests/data-view/data-view-events.test.ts
- tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts
- tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts

## 实施顺序与验收

1. 完整读允许修改文件和直接调用方，反查全部旧条件消费者。首报只列真实冲突及最终落点，不能先编码猜合同。若上述边界按实际源码不能成立，先报主控裁决。
2. 先围绕一个 OR+非等值+常量/父字段组合关系补失败用例，实现条件真源及装配/JSON往返；第一个生产改动立即最小验证。后续完成同一关系闭环的 CRUD、改名/删除引用保护、聚合实际消费，不停在“树保存成功”。
3. 测试覆盖：嵌套 AND/OR、非等值、0/false/null、常量不被当字段、父子同名字段隔离、限定名、Name/AsName映射、同端点多关系定位/隐式消费拒绝、读写失败原状态不变、原样序列化往返、关系变更后的计算缓存刷新、旧输入归一后输出唯一条件、不改变 viewCascades/模型之外视图状态。未知服务端值函数可保留/回读但本地明确拒绝，不伪造求值。
4. 最小验证用相应测试文件。冻结后运行 pnpm --filter @spark-appworks/spark-data run typecheck；pnpm --filter @spark-appworks/spark-data run test:run；根 pnpm exec vitest run 上列两宿主测试；精确 lint。根全类型检查由主控集中执行一次。不扩大到不相关失败；区分基线问题。

## 交付与限制

修改前保存准确字节基线到当前 evidence/semantic-page-baseline 的唯一子目录；不覆盖其他基线，不整体reset/checkout/stash。不得建分支/提交/推送/升级依赖/操作线上数据。不改主计划和 AGENTS。

报告写到本目录 model-relation-expression-result.md：具体完成合同、精确文件、测试命令/结果、仍未实现的命名视图/多关系显式聚合选择和服务端函数执行边界。本轮不宣称整个数据空间或全仓零回归。主控负责独立代码审查，不自行派 reviewer。
