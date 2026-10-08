# 模型关系表达式主控审查

状态：本轮底座闭环经主控复验通过；不是完整样板页验收。

## 最终验收与证据

- 根类型检查：`model-relation-root-typecheck-accepted.log`，退出 0，包含最终适配器身份冲突处理。
- spark-data 包类型：`model-relation-data-typecheck.log`，退出 0；全包测试：`model-relation-data-tests.log`，30 文件 / 647 项通过，执行时晚于数据包最后修改。
- 最终宿主两套：`model-relation-host-tests-accepted.log`，2 文件 / 48 项通过，包含最终第三模型身份冲突用例。
- 18 个实际改动 TS 文件的 ESLint：`model-relation-lint-accepted.log` 与 `model-relation-fixture-lint-accepted.log`，退出 0。
- AI 代码门禁：`model-relation-ai-codegen-accepted.log`，1000 文件通过；目录门禁：`model-relation-dirs.log`，通过。
- `model-relation-diff-check.log`：按现有 Windows CRLF 约定，保留默认空白检查并允许行尾 CR 后通过；未批量转换换行。默认 diff 检查曾将全 CRLF 测试文件新增行的 CR 报为尾随空白，实际该行没有空格尾缀。

正式适配器第三模型只按注册 `Name` 唯一解析；来源名和稳定表名不是注册别名。无法匹配注册名且字符串撞上稳定表名时，报告身份冲突并拒绝该条运行装配，原始正式表达式未变。普通外部引用原样保留，不声称已实现其本地函数执行与全部外部引用维护。

本轮由一名低阶 writer 实现，主控核语义、具体控制路径并复验。首轮冻结的类型/门禁失败没有删除或覆盖。以下保留修复过程；不代表仍处于待签收状态。

尚未验收：完整关系编辑 UI、显式命名视图/多关系聚合选择、多父字段输入级联、真实服务端函数执行、整页线上闭环与全部集成回归。本地计算失败沿既有通道返回 undefined 并仅在开发环境记录日志，未新增生产 UI 错误呈现。

## 本轮边界

用户确认模型关系采用完整过滤表达式；此前仅转换字段等值映射的实现失效。实施范围以同目录 `model-relation-expression-brief.md` 为准，`separate_relation_layers` 是唯一生产代码 writer。主控未修改其生产文件。保留混合工作树，不执行提交、回退、后端或线上写入。

## 已交回实施者的审查项

1. 空子表不得绕过表达式能力检查；服务端函数不能因为没有子行被解释为合法的零值聚合。
2. 旧字段映射的父键 null/undefined 原来不关联，输入归一须保留；显式过滤表达式仍遵循已有 Filter 的 null 语义。
3. 表定义存在字段不等于当前行具有该字段。父行缺失依赖字段须在构造 matcher 时失败；每个子行的依赖字段在匹配前检查，不能由 OR 短路遮蔽。仅检查实际表达式依赖，不要求所有字段投影。
4. 自关联同一叶子可能同时引用被改名的子字段和父字段，不能改完一侧就 return。
5. GetRefData 的 RefFieldName/FkFieldName 均属于 RefTableName；GetGroupData 的 GroupField/Field 均属于 GroupTableName，不能猜父子分工。引用的第三个模型同样要纳入维护。来源：本仓 filter catalog 75—89；只读后端 ParamUtils.convertToJoinTable 佐证 GetRefData。
6. GetExpData 等不可可靠重写的内容保留定义，相关结构修改明确拒绝；不得文本替换常量或猜表达式语法。
7. 裸字段与限定名在执行、改列、改表、删除保护和往返中的行为须一致。
8. 运行/序列化 DataResourceRelation.filterExpression 必填；旧字段映射仅留在明确输入合同，不能以 optional 和 deprecated 并存充当最终设计。
9. 必须有真实 DataSet/DataView 聚合及关系更新后重算的行为用例，内部 matcher 测试不能替代消费者验收。
10. 新代码遵循参数上限及具名对象参数规则；引用维护集中在 ResourceRelationDefinition，不在 CRUD 复制过滤树遍历。

## 待集中验收

实施者完成并冻结后核对精确 diff、上述用例以及完整 brief 矩阵，再接受 spark-data 类型/全测试、宿主两套测试和精确 lint 的留存结果；主控执行一次根类型检查与新增代码门禁。未完成前不引用临时通过数作为最终结论。

## 首次冻结审查：未签收，退回同一闭环

- 根 `pnpm run typecheck` 退出 2：adapter 的 `!Array.isArray(value)` 未排除 readonly 数组联合类型，产生 TS7053。见 `model-relation-root-typecheck.log`。用已有安全类型守卫处理，不加断言绕过。
- `pnpm run verify:ai-codegen` 退出 1：DataSetCrudToolCreateResourceRelationParams 变成 DataResourceRelationInput 的薄别名。见 `model-relation-ai-codegen.log`。改为实际类型消费，不加门禁例外。
- adapter 只转换关系两端的 GetRefData/GetGroupData 表字段引用，第三个已绑定模型的正式名与稳定表名不同时原样留下；随后 CRUD 会漏保护该第三表。须按真实绑定唯一定位第三模型，验证正式名、稳定名、来源名与字段别名不同；多重匹配明确诊断，不选第一项；未知外部引用不能猜成本地模型。
- 未识别的扩展值函数目前只保留，但结构引用检查只对 GetExpData 视为不透明。在无法证明其字段/表依赖时，结构改名和删除不能当作无引用；相关操作明确拒绝并保持快照，常量对象内的同名键不受影响。
- 旧 addResourceRelation 验证父/子字段存在；当前历史映射归一仅查类型，会把拼错字段接纳为关系。对旧映射输入保留已知的字段存在性检查；完整正式过滤表达式含合法非输出字段必须仍可装配，不可用运行输出列集把它拒掉。所有形式的端点必须存在且非空；失败保持原状态。
- 补齐 brief 中尚无行为证据的非输出正式字段、未知函数扩展原样往返、0/false/null、常量不被改写。API 与关系类型注释还称“字段关系/SQL 等值”，须在本范围更新成已实现合同；说明本地计算失败在现有通道中成为 undefined，开发环境记录日志，不能宣称已新增生产 UI 错误展示。

修复后只先运行对应最小测试；冻结再执行必要的包检查与受影响宿主测试。根类型检查和门禁由主控复验，新日志用新文件名保留上述失败证据。

## 下一页面闭环的只读准备

restore_model_forms 已将关系编辑的双视图保存 owner 与依赖字典合同记录在 `semantic-data-restoration-map.md` 最后两个小节。已有 DataSet.saveChanges → DataView.saveQueryViews → DataSpaceRuntimeApi.save 可一次提交两模型，须核每模型回执，不能声称事务。现有页面 HTTP fixture 只处理首命令，需要双命令夹具。

字典后端 `/api/DataOperation/GetData` 的 `Type=字典` 分支已经注册，本仓缺 typed 读取入口；不是缺少后端服务。下一轮先读实际 API 文件决定窄入口，不猜 scenarioId、不引入第二保存通道。本轮未发在线请求，也未实现关系编辑 UI。
