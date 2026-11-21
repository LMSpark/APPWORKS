# 投标文件编制与递交业务规格

适用于投标文件编制、报价、交付及 AI 动作的设计和验收。平台职责与阶段边界见[完整解决方案](./overall-solution.md)。

[术语与内容结构](#名词) · [注册模型的输入、输出和验证](contracts/resources-models.md#model-registry) · [61 个动作的编号](contracts/action-index.md#bid-action-sequence) · [递交与报价核验](contracts/action-index.md#bid-amendment-acceptance) · [验收依据与原始资料](contracts/action-index.md#acceptance-sources)

| 当前工作 | 从何处开工 | 下一份应取得的记录 |
|---|---|---|
| 人工编段、绑定两册报价 | 按任务书的[人工编制六步](./phase-one-taskbook.md#manual-edit-loop)办理，存储与合并查[修订规则](contracts/content-contract.md#bid-revisions)。 | 已采用修订、分册制作记录、实件与批准数据的对应。 |
| 接入 AI 按句改写 | 查[ClassModel](contracts/actions/knowledge-ai.md#bid-classmodel)、[逐次调用](contracts/generation-ai.md#bid-ai-io)，再按动作 38、39 预演与采用。 | 实发输入、原返回、字段验证及所选片段的采用记录。 |
| 封装、递交及回执反查 | 从[九项递交核验](contracts/action-index.md#bid-amendment-acceptance)找本次问题，按动作定位上下游。 | 各义务的实件、原操作、接收及截止效力凭据。 |
| 实现入口与验收 | 从[蓝图交接](delivery/scope-blueprint.md#blueprint-delivery)到[动作实现标准](contracts/implementation-interfaces.md#bid-action-implementation)，再核[已有代码](contracts/implementation-interfaces.md#bid-implementation-handoff)及[操作接口](contracts/implementation-interfaces.md#bid-interfaces)。 | 返回结果、实际持久化状态及异常接手记录。 |

业务规格中的 01–61 表示业务动作；节点、页面和任务见配套文件。文中负责人、审核人等表示责任归属，不表示每一步必须由人点击；授权 AI 可执行其职责范围，统一按[记录、审计与纠正](contracts/implementation-interfaces.md#bid-decision-audit)留据。

## 名词

### 内容

| 短名 | 成熟产品中的对象 | 含义 |
|---|---|---|
| 平铺树 | DOM 规定父子关系、同级顺序及前序遍历 | 本方案以邻接表保存这套顺序，每行的 `parentId` 指向父节点，`index` 决定同级位置。[DOM 树的定义](https://dom.spec.whatwg.org/#trees) |
| `type` | 业务语义结构；通用块级模型 | 内部统一节点类型；文件标签和原生对象仅在导入、导出边界转换 |
| `class` | CSS 的 class；Word 样式及其 `basedOn` | 版式和编写规则写在文档模板里 |
| `value` | 可见文本 | 人读的那一段 |
| `data` | Word 内容控件绑定的数据；Mustache 的上下文 | 机器比对、引用、合计的规范值 |
| `{{名字}}` | Mustache 占位符；Word 的域和内容控件 | 正文引用数据的唯一写法 |
| 文档模板 | Word 模板加一份 CSS 样式表 | 类、版式、分册规则合在一份配置里 |
| 内容表达式 | ProseMirror 的 content expression | 父子是否合法只认这一份 |

### 版本

| 短名 | 成熟产品中的对象 | 含义 |
|---|---|---|
| 修订 | Git 的一次提交 | 只追加。当前头相当于 `HEAD` |
| 候选、采纳 | 内容系统里的草稿和已发布 | 模型和导入只产生候选。采纳后才成为头 |
| 节点哈希 | Git blob | 这一行的内容 |
| 子树哈希 | Git tree | 这一行加上按顺序排列的子树 |
| 有效哈希 | 带依赖的构建哈希 | 树哈希加上引用解析后的结果。审核绑它 |
| 三方合并 | Git 的三方合并 | 基线、当前头、候选 |
| 发布指针 | 发行通道。npm 的 dist-tag | 平台、企业、项目各指向一个已发布版本 |
| 锁 | npm 的 `package-lock` | 一次运行或一次交付用过的版本闭包。重放只读锁 |

### 生成

| 短名 | 成熟产品中的对象 | 含义 |
|---|---|---|
| 配方 | LangChain、Dify 的提示词变量，加上检索产品里的上下文预算 | 有哪些变量、从哪来、上限、强弱。不含提示词正文 |
| 槽位 | 上面的一个输入变量 | 提示词里只写变量名 |
| 提示词 | 系统提示词和用户提示词 | 只能引用配方里声明过的槽位 |
| 上下文清单 | 一次推理冻结下来的输入。LlamaIndex 的 source nodes | 可重建待发内容，实发内容由执行端另行回读 |
| 工艺路线 | BPMN 的流程；ISA-88 的程序 | 一棵工序平铺树。根的 `type` 是 `route` |
| 工序 | BPMN 的活动或子流程；ISA-88 的单元程序、操作、阶段 | 树上的一行。`type` 是结构分类，`class` 是业务分类，嵌套用 `parentId` |
| 工位 | BPMN 的泳道；制造执行里的工位 | 标准岗位。`class` 是给编排模型看的分类，`capability` 才是执行能力 |
| 能力 | BPMN 的服务任务类型 | 方案中的七类职责为检索、编写、校验、审查、摘要、抽取、确认。运行时函数按适用职责编排 |
| 模型档位 | 模型部署配置 | 供应商、模型名、参数。密钥只留引用 |
| 问题清单 | 静态检查的诊断。评审意见 | 编号V1–V14。审查建议只记提示；授权AI的业务核定另留原决定 |
| 规则集 | 按来源登记的校验规则 | 招标约束引用本次投标有效原文。企业可另设内部放行标准，分别记录两种结论 |
| 校验 | CI 里必须通过的检查 | 确定性规则 |

### 依据、资源、呈现

| 短名 | 成熟产品中的对象 | 含义 |
|---|---|---|
| 事实 | 主数据 | 金额、工期、日期、身份。正文只写 `{{名字}}` |
| 要求 | 招标条款拆成的需求条目 | 评分、资格、符合性、否决、格式 |
| 谱系 | 需求的稳定编号 | 换基线时编号不变，正文不跟着改写 |
| 基线 | 配置管理中的基线 | 冻结选定的事实与要求版本、来源，以及按范围直接选用的递交记录 |
| 响应 | 投标人对具体要求的实际答复 | 可以是实际填报数值、承诺、方案说明或指定证明。原件要求说明偏离时，再登记相应结论 |
| 招标记录 | 文档抽取得到的一条结构化结果 | 未确认的只在解析台上 |
| 资源 | 企业内容库里的一条受控资料 | 用途分为证据、参考、模板、规则 |
| 业务模型 | 可查询的业务对象定义 | 从主题目录查模型关系、属性及动作输入输出，在绑定实例上办理。产品经 SPARK API 访问获准资源，执行复用统一模型宿主。 |
| 知识四层 | 目录、业务指南、卡片与原文 | 按问题找到相应材料，正式依据追到原件版本和具体位置 |
| 历史项目 | 业绩库、案例库 | 项目记录和旧投标文件供借鉴。业绩证明才是证据 |
| 素材包 | 这一次写作确认过的引用包 | 留在当次运行，不进正文树 |
| 项目记忆 | 已采纳章节抽出的数字和偏离 | 后写章节按类查询，涉及本次承诺回到经批准使用的事实和原答复核验 |
| 计算表 | 由公式得出的正文表 | 展开后是表头和行。招标人规定递交的原生计价文件另按指定格式交件和核查 |
| 过程成果 | 构建中间产物 | 交给下一步时带类型和哈希 |
| D、S、B、R、O | 源数据、样式、绑定、中间表示、输出文件 | R 是中立呈现输入；O 由导出适配生成，不写回内容树 |
| 交付清单 | 一次构建的产物清单 | 修订、锁、文件哈希、保真说明 |
| 门禁 | 交付前必须通过的检查 | 不过则不能交付 |
| 暗标 | 匿名投标 | 该册不出现身份 |
| 分册 | 按本标段文件组织的内容单元 | 商务和技术可以合册，报价可以另装一个信封。记录各册进入哪个递交包、哪个环节可以读取 |

**三套类的使用位置**

| 配置对象 | 所做决定 |
|---|---|
| 文档模板上的类 | 决定内容的版式和章节角色。 |
| 工序的 `class` | 标明解析、大纲、编写或审查等活动。 |
| 工位的 `class` | 限定编排模型可将该岗位放在哪类工序下。 |

**定义出处**

- 内容结构依据见第 1.0 节。占位符与提示词变量分别参照 [Mustache](https://mustache.github.io/mustache.5.html) 和 [LangChain 的 Prompt templates](https://python.langchain.com/docs/concepts/prompt_templates/)。
- 流程、活动、子流程和泳道参照 [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/About-BPMN/)。工序的程序、单元程序、操作和阶段参照 [ISA-88](https://www.isa.org/standards-and-publications/isa-standards/isa-88-standards)。

## 合同分册

业务规格按稳定领域合同拆分；总入口不再重复各分册正文：

1. [内容树与版本合同](./contracts/content-contract.md)：内容树、引用、模板、存储、哈希、提交与合并。
2. [依据与业务数据合同](./contracts/business-data.md)：事实、要求、基线、响应与招标记录。
3. [生成与验证合同](./contracts/generation-ai.md)：配方、上下文、运行、AI 输入输出与 V1–V14 校验。
4. [资源、知识与模型合同](./contracts/resources-models.md)：资源、知识目录、ClassModel 注册、查询与历史项目。
5. [配置与过程成果合同](./contracts/configuration-process.md)：工位、工序、成果交接、配置编审和运行分开。
6. [生产与递交合同](./contracts/delivery-interfaces.md)：数据/格式、制作、导入、门禁与递交证据。
7. [编辑、权限与实现接口合同](./contracts/implementation-interfaces.md)：编辑、权限、动作实现、页面函数与 ClassModel 接线。
8. [验收合同](./contracts/acceptance-actions.md)：蓝图、内容、AI、基线、生产、递交和生命周期验收。
9. [61 动作与递交核验索引](./contracts/action-index.md)：动作编号、归属索引、九项递交核验与验收来源。

跨文档链接直接指向分册锚点；动作编号、业务术语和验收口径仍保持唯一合同。
