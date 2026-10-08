状态：implementing

# D1c 数据空间创建人名称的安全解析

用户既有派工/长期利益裁决授权下批准，D1b已主控生产接受。本片仍一个只读闭环，未解决原生表单dirty生命周期前不加入CRUD。3原文件：src/lowcode/data-space/lowcode-data-space-catalog.ts、src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue、tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts。不得扩到包API/后端/依赖/配置/新文件。

## 事实

固定参考 E:/r/sparkproject Git 842dec4f11b333df904b9a4e26b6566b0802bab8 的 apps/appworks/src/data/api/data-set/list.ts，#hydrateCreateUserNames 按可用createuser集合查询同场景 Base_UserInfo，ROWID in ids，名称字段UserName；页面createuser显示名字，缺失显示未解析用户并有提示。当前真实readonly d1a/lookup-feasibility.json已验证同目录场景能查Base_UserInfo ROWID/UserName（total30），不输出个人值。当前owner/page/test主控已全读，执行前重读当前版本。

当前 rows 的业务值未自动遮罩，必须从两次原查询的 fieldAccess 分别消费；不复制参考未脱敏原row再泛化lookup。读runtime.query/resource/pagination及真实context，allPages先核原rows/total后投影。知识读取按knowledge/README；不将知识或报告当产品SSOT。

## 技术与边界

1. 在已有query完成Base_DataSet后、发布projection之前进行创建人解析。只收集本页 createuser 字段 read===visible 的非空实际scalar ID，trim/去重；不得把masked/invisible的原ID送入后续网络filter，也不能从 '••••'/'-' 等显示占位值反推可见性。原字段masked保留••••、invisible保留空、真空值显示'-'。保持目录rowid及其他六列现有投影合同。
2. 有可查ID时同 owner scenario/scope 查询Base_UserInfo：fields=['ROWID','UserName']，filter ROWID in IDs，allPages:true。空集合不查询。明确按真实上下文校验主键为ROWID且全量唯一，不能首项胜出；缺/重复key显式失败。仅关联请求的ID，不让多返行污染。
3. 原数据集createuser可见是第一道条件；用户行ROWID必须visible才可关联。UserName visible时读scalar非空名称，masked输出固定遮罩，invisible输出空，不能以原ID/其它字段绕开。查无该用户、用户key不可见或可见名称空时用“未解析用户”，统计未解析的不同可见请求ID数量；提示只给数量，不列历史ID、隐藏字段或原始值。UserName masked/invisible有明确权限结果，不算无法解析，也不得回退ID。原始行/context仍私有，不送入Vue/DOM/attrs。
4. result可增加明确 unresolvedCreatorCount 数量，UI列标题改“创建人”，必要时显示“有 N 位创建人当前无法解析”。新查询清旧提示；仅当前owner+revision成功才发布。查询失败进入原error，不能返回半列表并悄悄吞掉lookup异常；scope失效前后检查保持，旧搜索在用户lookup阶段迟到成功/失败不得覆盖新结果/提示/loading。
5. 不新增公共helper或泛型lookup框架；应用选项独立，不将用户目录所有人提前下载。不改主键/元模型，不用执行应用代替业务sysid。字段ID显示与写基线未来仍需严格分离，本片没有写操作。

## 验证顺序

先有辨别力owner用例RED→最小实现GREEN，再实际Vue结果+警示呈现。复用现有真实context夹具，在具名ContextOptions支持正式primaryKey='ROWID'，避免4个位置参数；mock按metaName分发，不依靠请求顺序。覆盖：仅本页可见去重ID发in查询；原createuser h/m不入filter、DOM或警示；用户ROWID及UserName h/m不泄漏；未解析数量（不列IDs）；重复键/查询异常显式错误；用户lookup阶段同scope旧A晚于B success/failure不能覆盖；实际界面看到解析名称。

最终root typecheck、owner/page/registry定向测试、3文件lint、ai/dirs门禁；不跑根/包全量或build/browser。主控之后统一build与真实目录名称/应用筛选回归。保存真实命令stdout/exit和3hash到本目录creator-validation.log后冻结回报。无新理由不重复历史门禁；不commit/push/建分支/业务写入/改memory或knowledge。
