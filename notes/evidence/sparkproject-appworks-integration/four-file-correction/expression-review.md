# 完整过滤表达式目录及祖先引用主控验收

状态：本轮限定本地闭环通过；完整四文件设计页和全部集成仍 implementing。

## 已验结果

- 本页一个目录生成函数由 ValueFun、模型 Filter、关系/JoinFilter 共用，当前模型加全部可读父分支/祖先；按正式 ID 广度遍历，去重、环终止。过滤 LHS 保持当前/子模型字段；普通字段和来源入参的参数命名空间保持原合同。隐藏/脱敏及空注册名不提供引用；有可读重复模型名时沿既有页面读取错误通道拒绝 ready，重挂载也检查。
- GetTableField 祖先定义不再因不是直接父而被丢弃。唯一正式名转为对应稳定表/字段名，直接父裸字段兼容；未绑定外部引用保留，身份冲突/歧义诊断仍明确。第三模型字段/表改名、删除保护与序列化重开均通过真实 DataSetCrudTool。常量字符串不作引用改写。
- 正式注册名与稳定表 key 属于不同命名空间：有唯一正式匹配时依它翻译；只有无正式匹配的外部字符串撞本地稳定名才拒绝。点号表名按最后点号分隔，Ancestor.Part 不误认 Ancestor。
- 本地 matcher 仍只有直接父/子行上下文；缺祖先上下文时拒绝，真实计算列不产错误聚合。该失败沿已有通道得到 undefined，不代表已新增生产错误 UI。没有修改前端输入级联或扩建求值器。

## 最终证据

- 页面最终 57/57（09:54:07）：expression-context-full.log；真实 Renderer 来源编辑用例和公开页面函数图反例均在内。页面精确 lint exit 0，expression-context-eslint.log。JSDOM requestSubmit 未实现提示存在，不冒充浏览器验证。
- 适配器最终 15/15（10:02:44）：expression-reference-review-final-adapter.log。
- 数据包真实 CRUD 与计算列最终 106/106（10:02:44）：expression-reference-review-final-spark-data-tests.log。
- 包类型 exit 0：expression-reference-review-final-spark-data-typecheck.log。根类型最终 exit 0：expression-final-root-typecheck.log；目录闭环另有紧邻通过基线 expression-context-root-typecheck.log。
- 主控五个下游 TS 文件 ESLint exit 0：expression-final-reference-lint.log。执行者报告的原 lint 日志缺失，主控已补跑并纠正报告，未把不存在的文件当证据。
- pages-config exit 0：expression-context-pages.log。AI 代码门禁 exit 0（1002 文件）：expression-final-ai-codegen.log。无新增源目录/文件，不重跑已过且未受影响的目录门禁与 API/宿主大套。

主控读实际生产改动、调用者与新增行为测试，退回并修正空名引用、重复可读名称、命名空间混同和点号前缀误判。红例与修复日志留存，详细范围与字节基线在两个 result 文件。共一名较低阶执行者顺序完成两个闭环，主控未并写生产文件。

## 续工边界

不再重复表达式目录/祖先引用任务。下一页内工作从 D02/D13 的图选择、拖动、显式布局保存原语义开始研读；当前图仍只读。来源创建、前端模型/数组/数据处理、预览、API 信息及完整页面验收继续保留范围；新草稿字段权限问题仍待已发问题答复，不自行推定 allowAdd 扩权。

多父字段输入级联、命名视图/显式多关系聚合消费是独立未完语义。没有在线写入、提交、建分支或回退。不得以本轮 178 项定向通过宣称整页、后端全部函数或全仓零回归。
