# 正式 DataView 字段输出与行身份验证

状态：本轮局部闭环已验证；完整 DataSet 定义维护和 AppWorks 集成仍未完成。

## 行为

正式模型绑定的 DataView 使用后端已有 REQUEST 输出模式，字段来自视图投影或本次 fields；请求补齐正式模型主键，继续按正式输出名映射到模型字段 Name。补齐的主键服务于原查询权限和保存，不改写视图显示列或持久定义。无主键模型保持只读，不猜 id/rowid。直接 runtime.query 和未正式绑定的视图缺省模式保持原合同；显式模式非法时在 I/O 前失败。

范围为五个生产文件和两个既有测试文件，见 final-hashes.json；相对本轮前像的精确差分见 projection-query.patch。主控直接实现和自审，没有使用代理。原工作树改动保留，未改 Java、界面或线上业务/配置，未 commit/push/建分支。

## 验证

- 开工 typecheck-before.log、最终 typecheck-final.log：根 pnpm run typecheck，exit 0。
- red.log：两个新行为用例首先失败，实际收到视图外 extra 字段。
- green.log：相同两个查询→权限→编辑→签名提交→回执用例通过；focused-final.log 共111项通过。
- api-regression-final.log：API包8套件540项全部通过，覆盖正式查询/保存、权限、原协议、分页、输入、模型别名及设计读取。
- root-regression.log：根7套件102项通过，覆盖元数据入口、文件持久化、表级提交、场景装配、计算及字段级联。与API合计15套件642个不同用例。
- lint-final.log：对 final-hashes.json 的七条路径运行 pnpm exec eslint --max-warnings=0，exit 0；成功无诊断输出。
- ai-codegen.log：1018文件扫描通过。七路径 git diff --check 通过；最终七份源码哈希复核一致。

首轮 API 为539通过/1失败：既有字段去重用例仅期望 salary，遗漏正式主键。根据线上证据和新行为合同，将精确预期修订为 salary 一次、rowid 一次及 REQUEST；保留不重复字段和不改写 AsName 的要求。首轮 lint 拒绝在已收窄联合类型上做运行时穷举；以 unknown 接收边界值后校验，原非法值测试仍通过。两个失败日志均保留，没有放宽生产校验。

## 线上只读结果

online-native.mjs 使用 ScenarioViewConfig → loadScenarioDataSet → 正式 Assembler → DataView.loadFromServer；请求拦截器只固定同一服务地址、限制只读端点并记录字段，不改写请求数据或 OutputFieldMode。

online-native-result.json 记录：

- 文件形状配置仅显示 Name 的视图，请求并返回 Name + rowid；显示列仍只有 Name，读取可见、写入获准、编辑可用。
- 本次 fields=[Name] 覆盖也保留正式行身份；随后默认查询仍返回原12个输出字段，配置内容未改变。
- 实际单目标 loadLowcodeDataSpaceMetadata 重新加载成功：1空间、7模型、119字段、0关系，各表行数与服务端总数一致，归属由正式 loader 核验。
- 线上业务和配置写入0。真实写请求与回执链采用 HTTP 边界夹具验证，未执行线上保存。

online-result.json / online-permission-result.json 是修复前的诊断比较，探针手动设置模式；它们用于证明问题及后端能力，不冒充修复后的原生执行证据。

## 保留边界

原生投影仍遵守正式模型字段/表达式合同；REQUEST 的实际选择和授权由后端执行，不代表任意资源、表达式、聚合或树配置均已完整支持。命名视图自动加载、完整树查询、全部表级操作、双来源定义保存恢复等缺口仍见主计划和语义研读。本轮证明限定查询保存闭环，没有宣称全仓零回归。

候选知识暂存：字段投影应区分显示列、请求输出、原查询行身份；正式主键即使不显示也可能是权限与保存依赖。尚未写入 knowledge 或个人记忆。
