# B2 数据库关系编辑补充冻结报告

## 冻结范围

本轮完成关系编辑器的窄闭环及验证，源码与测试快照见同目录 `b2-relation-freeze-sha256.txt`。公开变更未运行正式 ClassModel 生成；由主控在复审后刷新。未做服务端/Java写入、正式SPA写操作、提交或推送。

## 变更摘要

- 关系编辑统一复用原关系 DataView overlay、checkpoint、RendererFilterExpression 和 DataSet/DataView 保存链；删除旧 SaveDraft 路径，领域测试迁移到 `addRow` 加精确 row id 的 `DataSet.saveChanges({ views })`。
- 关系角色/peer切换执行多字段权限预检后再修改，端点目录与字段定义按正式ID读取；peer候选使用正式命名 DataView，同库分页查询。新增/编辑校验保存目标、查询身份和字段读取权限。初始关系目录不再触发无条件宽查。
- 关系表达式存储沿 `DataViewFilterCodec.serializeStored` 保存SPARK JSON字符串。名称 `rlname` 与完整表达式 `RelshipExp` 分离；切换角色或peer只按明确操作清理旧表达式。历史跨库端点在名称单字段保存时保留，变更结构时按当次正式目录核验。
- 异步保存校验捕获本次结构快照，在异步端点/字段查询后及提交前复核；快照变化时拒绝提交、保留最新 overlay 并提示重试。名称快速路径也核结构变化，避免夹带迟到的新结构。
- 未映射 DataType 不进入新候选；若不被现有表达式引用，仅显示非阻断警告，映射字段仍可编辑。若现有表达式引用了正式存在但类型未映射的字段，保留原表达式并给出明确类型诊断，阻止不安全修改。未覆盖/转换的类型仍属限制，不猜测映射。
- 页面关闭保护消费 RendererFilterExpression 的 `onEditingChange`，覆盖已有干净关系中尚未应用的表达式候选。

## RED 与有效性

以下修前 RED 均有独立原始日志，且已由主控核准：

- `b2-relation-late-structure-red3.log/.exit`：延迟端点查询期间修改原 RelshipExp，旧实现仍提交并清除 overlay。
- `b2-relation-name-race-red1.log/.exit`：名称快速校验跨 await 时新增结构 patch，旧实现把新结构夹带提交。
- `b2-relation-mixed-data-type-red1.log/.exit`：合法表达式包含可映射字段时，另一个未知类型字段错误地隐藏整个标准表达式编辑器。
- `b2-relation-unmapped-expression-red1.log/.exit`：原表达式引用未知类型字段时缺少精确类型诊断；原值本身仍保留，未证明数据损坏。

早期夹具错误保留在各自原始日志，但不计作有效 RED；例如首轮延迟结构夹具端点不匹配、错误断言/查询等待失败。不得把它们描述为产品反例。

## 最终验证

- 数据库关系受影响套件：`b2-relation-database-suite-final4.log/.exit`，13 个测试文件、147/147 通过，exit 0。
- 关系混合类型定向用例：`b2-relation-mixed-data-type-targeted1.log/.exit`，2/2 通过。
- TypeScript：`b2-relation-typecheck-final6.log/.exit`，exit 0；这是最后两处 readonly 测试类型收窄之后的结果。全库套件在该纯类型测试改动之前已通过，按约定未重复运行。
- Scoped ESLint：`b2-relation-eslint-final5.log/.exit`，exit 0。
- AI codegen规则：`b2-relation-ai-codegen-final4.log/.exit`，1388 个文件通过，exit 0。

先前失败的 typecheck、lint、codegen及套件日志均保留；以上列出的是相应的最终成功轮次。

## 尚未验收/限制

- 本轮未刷新正式 ClassModel 生成产物；新增/删除的公开面需主控生成刷新后复核。
- 未做本轮冻结后的连续 SPA 验收；由主控复审、生成及安全的真实页面验收接手。
- 只有正式 `DataType` 已映射的字段进入新候选；未映射类型不猜测转换。引用此类字段的历史表达式保留原值并阻止不安全编辑。
- 不展开关系之外的注册、同步或 DDL 服务动作；不据本地夹具声称服务端已支持未验证行为。
