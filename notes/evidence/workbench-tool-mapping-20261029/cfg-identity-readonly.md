# cfg 工具身份冲突：窄只读合同分析（2026-10-29）

唯一阅读工作树：C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。HEAD 为 3531bf09f0c3a870f75c9f1b805a65f41fc60a95，工作树包含本轮历史切片未提交修改。此报告分析 cfg 现存链，不据历史切片静态 PASS 宣称工具映射已完成。未访问凭据，未运行服务/UI/业务请求或测试，未修改产品、测试、台账、生成物或 Git。只写本仓外报告。以下相对路径均基于该工作树，行号为读取时当前源码。

## 结论

cfg 当前确有自身闭环冲突，不只是 builtin 缺映射：创建器写 cfg:<pageId>；发布面把后缀当 <applicationId>/<pageId> 并写回 NavigationUrl；树和运行导航把整个后缀当 pageId；真实文件读写却要求 pageId 是单个路径段。已发表成 cfg:APP/tool 的目标因此不能经当前完整运行/编辑链消费。既有测试各自使用了不同身份前提，绿并不能证明闭环。

现有最小可收敛方向是继续采用二元语义身份 (applicationId/projectId, pageId)，导航节点 nodeId 单独保留；工具 pageId 是应用内工具 ID，远端 customPath=<applicationId>/<pageId> 仅属于存储定位。发布改变 VersionId，不改变工具身份或把 locator 塞回 cfg。这个方向复用当前多数真实消费者；不要求 PageRuntimePool/三文件 owner 接受任意斜杠，也不要求原生 Vue 页伪造三文件。

但 cfg:APP/tool、cfg:shared/orders 的实际存量意义尚未核实，不能直接批量改写/删除后端导航。代码里的 shared/orders 测试只证明 wire 保留和投影字符串，不证明真实目录存在。对旧值应先明确是“带应用目录的旧 locator”还是“层级工具 ID”；只有确证映射后才能迁移，不能永久保留两个互相猜测的运行合同。本报告是下一片输入，不是新增总计划或已冻结实施方案。

## 1. 当前公开合同与五种身份

| 身份 | 当前声明/源码 | 已证实语义 |
| --- | --- | --- |
| applicationId / projectId | packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint.ts:45-55、90-99；src/lowcode/lowcode-runtime.ts:595-605 | 蓝图所属应用与执行 X-AppId 要一致。projectId 在该前端链是应用身份，不能由 cfg 路径前缀偷偷切换执行应用。 |
| nodeId | project-blueprint.ts:47；lowcode-runtime.ts:187-191、240 | 蓝图/导航调用身份；实际运行 URL 是 /__page/<encoded nodeId>，并非工具文件目录。多个节点可调用同工具。 |
| pageId | packages/spark-project-model/src/page/page-tool.ts:12-26；io/page-content-loader.ts:12-18 | 稳定工具 ID，PageTool 自身不包含节点身份或运行数据；PageFileReadCommand 分开 projectId/pageId/fileName/versionId。公开 JSDoc 没有完整字符语法，PageTool仅trim非空；更严格单段约束现位于真实文件资源/宿主，应补齐公开语义一致性。 |
| scenarioId / conid | project-blueprint.ts:36-39；lowcode-runtime.ts:188-191、245 | 工具调用的数据空间参数，与 pageId/nodeId 分开。cfg 修复不能改成拿场景 ID 找三文件。 |
| customPath / storage locator | lowcode-runtime.ts:595-605；page-tool-files-command.ts:258-261、307-310、460-462 | 远端设计文件位置固定 app/page。快照、恢复、删除必须与同一个 appId/pageId 严格相等；不能通过允许任意目录修复上层身份。 |
| VersionId | packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-file-version.ts:1-5、13-16、43-84 | rule/script/style 三个发布引用。裸文件是工作内容，N__filename 是独立快照；场景 pagedata 没有此三文件发布指针。缺发布段不能猜最大版本。 |

补充：page-content-loader.ts:10、34-135 按项目+工具缓存三文件，不能把同 pageId 的不同应用合为一份。PageRuntimePool:65 的实例键还包含 nodeId、调用参数和 hash，不能为了“统一工具”合并不同调用实例。

## 2. 精确冲突链与真实消费者

### 2.1 创建/编辑：相对语义工具 ID

- src/views/app/dev-system/useDevState.ts:442、1472、1661 生成 NavigationUrl=cfg:${pageId}；页面子节点使用 UUID 类独立 pageId，工具三文件由 PageToolFilesDataView.create 创建后再写导航，未知导航回执不擅自补偿。
- components/NodeTargetConfig.vue:11 文案 cfg:工具ID；:31 直接slice(4)得到toolId，:32工具选项也是cfg:${page.pageId}，:37交给createPageForSelectedNode。当前任意allow-create字符串缺同一语义解析，不能把UI字符串切片当身份合同。
- packages/spark-project-model/src/blueprint/project-blueprint-tree.ts:12、40-43 直接剥cfg:、去开头/、去?后缀，但不剥应用前缀，不一致处理#。resolvePageNodePageId消费者包括ProjectWorkspace:751-754和ProjectToolResource:70。
- ProjectToolResource（packages/spark-project-model/src/page-tool/project-tool-resource.ts）:33-40 把pageId/fileName/versionId设为正式查询参数；:53-60拒pageId含/；但catalog:63-81用resolvePageNodePageId产生pageId并去重，没有同样的合法性检查。所以目录可能输出后续文件视图无法读取的“工具ID”。

### 2.2 运行：节点调用与工具身份分开，但直接吞 cfg 后缀

- lowcode-runtime.ts:183-191 用nodeId生成/__page URL；:246-248 tool={projectId:record.projectId,pageId:target.slice(4),versionId}，保留整个后缀，与树的去?行为也不同。
- packages/spark-app/src/navigation/runtime-navigation.ts:42 正式tool包含projectId/pageId/versionId。
- PageRuntimePool（packages/spark-app/src/router/page-runtime-pool.ts）:53-67从meta.tool或programmatic参数获取二元身份，核路由projectId一致；:73建立PageTool；:81-92在load时重核导航nodeId仍绑定同工具；:93-99读取三文件，把发布VersionId原样交给reader；:102-105按同projectId装配场景。此池不应新增“再拆一次cfg路径”的旁路。
- dynamic.ts:628-632的程序调用路由为/__tool/:pageId，携带项目路由参数。与导航/__page/<nodeId>不同；nodeId、pageId与URL位置不能互相替代。
- readLowcodePageFile（lowcode-runtime.ts:109-121）用VersionId生成精确N__fileName；customPath调用toolFilePath，后者:597-600明确拒绝pageId含/。因此runtime投影给pageId='APP/tool'或'shared/orders'时，真实reader立即失败，尚未读远端。

### 2.3 保存/恢复/版本目录：保持单段 pageId 和固定应用

- src/lowcode/resources/shared/page-tool-files-command.ts:8-9 的工作文件IO把appId/pageId分开。savePageFileCore:157-164拒绝pageId含斜杠、百分号、控制符、?#，保存基线与PageTool绑定；不能传storage locator冒充pageId。
- createSnapshot:258-261、restoreVersion:307-310要求customPath精确等于appId/pageId；delete的isValidDeleteTarget:460-462同样要求。它们是原DataSet/DataView命令链，不能为cfg修复绕过它们直接上传。
- useDevState.ts:331-336 restore还核当前项目、激活PageTool、ownerDataSet；:1697挂载删除捕获customPath=projectId/pageId。
- DevFileEditor.vue:265-284从明确pageId、projectId组成恢复目录；:296-318同样组成快照目录，先保存当前工作文件再创建快照；不会从NavigationUrl直接截路径。
- src/lowcode/resources/shared/project-tool-version-resource.ts:33-46校验应用与单段pageId，:54读取appId/pageId。目录行是正式DataView；它不是应随builtin整体移除的“无消费者旧代码”。
- lowcode-runtime.ts:829-872 createPageToolFilesIo覆盖list/read/upload/restoreWorkingFile/remove与快照读写，工作文件经toolFilePath；快照目录还校验当前应用。普通动态应用仍依赖此远端适配。

### 2.4 发布面是冲突的产出端

src/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue:

- :174-187捕获当前nodeId/pageId/projectId/scope与三文件，核节点/应用/活跃工具不变。
- :191-197 对cfg目标直接slice(4)当customPath，随后要求首段等于projectId且至少两段。因此正常创建器写的cfg:tool-A在同APP-A发布时立即被“交付路径必须属于当前请求应用”拒绝，根本未提交快照。
- :204走state.createPageToolSnapshot；实际owner又要求pageId单段且目录app/page。用真实树投影得到pageId='APP-A/tool-A'时，既有cfg:APP-A/tool-A也不满足owner的app/page一致性。
- :212将customPath再次写入NavigationUrl=cfg:APP-A/tool-A；:213写VersionId；:216正式DataView保存，:217-218核发布指针回读。
- :114 deliveryAccess还把NavigationUrl.write设为发布先决条件。若正式发布仅改VersionId，应保留读取导航以核身份、VersionId读写权限，删除不再修改NavigationUrl的write要求；不能扩大任何真正写字段的权限。

所以不能只放宽发布面:197，或只让reader接受斜杠。必须修正发布产生/解释身份的规则，与已有保存/运行二元合同一致。

## 3. 既有测试证据为何不足

1. tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts:41默认导航为cfg:APP-A/tool-A，但:80手填activePageId='tool-A'。真实resolvePageNodePageId会返回'APP-A/tool-A'。:89 createPageToolSnapshot还是独立spy；:264-271只证明用人工分离的pageId/customPath可以走发布流程，没有检验真实投影→真实owner。
2. tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts:1007-1022期望cfg:shared/orders投影为pageId='shared/orders'，且用这个例子证明场景参数独立。后一个语义可保留，前一个不能作为目录可读证明；它不调用reader。wire API测试project-blueprint-api.test.ts:89、102也只是原文保真，不是工具ID格式许可。
3. tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts:16-17使用单段orders-tool；:21-22 reader只返回文本，不校验真实宿主locator。:385可证明VersionId和身份参数传递，不能发现上游发布后缀被当ID的问题。
4. tests/app/dev/page-tool-files-command.test.ts:36-42已经拒绝pageId=PAGE而customPath=APP/OTHER的恢复，这是应保留的正确守卫，不应为发布测试变绿删除。
5. packages/spark-project-model/tests/project-model.test.ts:85已有两个节点调用同工具且DataSpace不同的正式回归。新的解析不得把nodeId或scenarioId写成pageId，破坏共享工具与独立调用。

## 4. 最小可收敛方案（待主控以合同选择冻结）

### 4.1 推荐的稳定内核

- 唯一工具语义目标为{applicationId/projectId,pageId}；同应用pageId为当前真实资源支持的单段ID，定义拒绝空值、路径分隔符/编码分隔、dot-segments及控制字符的明确边界。不要靠多处trim/slice/拼路径各自解释。补齐公开类型JSDoc与正式生成合同，语法校验留在现有合适公共边界，不新造通用身份框架。
- 在现有蓝图工具解析位置形成一个明确入口，创建/编辑、树投影、运行导航、工具目录共同消费。低code API wire层继续保留原NavigationUrl，不在API反序列化时静默改后端值或重新推权限。
- 规范创建的NavigationUrl继续cfg:<pageId>。发布从当前正式节点核同一pageId，传同projectId/pageId给文件owner；locator由原存储边界组合。发布仅提交VersionId，且每个文件的真实快照确认、部分成功/未知恢复边界照旧。
- PageRuntimePool无需新增存储路径字段或cfg解析；它继续拿已解析的tool二元身份和VersionId。PageTool本地草稿、原DataView文件提交、请求scope/迟到保护与缓存身份不变。
- 现有PageToolSnapshotInput.customPath可以在本片暂留作精确交叉验证，不需要为修冲突立刻大改整个命令类型；但它应由相同正式工具身份解析得到，不再由cfg后缀任意充任。JSDoc“由导航解析文件目录”须纠正为“当前工具身份对应的已校验存储定位”。若后续builtin需要与app/page不同的仓内物理位置，位置映射属于source adapter/manifest，不改变pageId。

### 4.2 旧值的必要边界

源码目前没有正式storageLocator字段，也没有证据表明cfg:shared/orders里的shared就是applicationId。不能自动取最后一段、自动剥第一段、自动加当前app后尝试两种路径、读不到再fallback；这会串工具或跨应用。

最小方案可先消除新产出错误和统一明确的单段目标；对其他值在同一解析边界明确诊断。已知历史发布产物cfg:<当前应用>/<单段工具>若需保留，必须先以现存真实记录/目录核实来源，再做明确迁移或显式映射；不要把模糊兼容永久混入运行读写。是否需要一次性迁移、以及真实层级工具是否有消费者，是本报告未核项，不能用本次静态分析授权后台批量写入。

### 4.3 builtin 不应抢跑

config/applications/appworks.json:1-36只声明应用、导航和四场景资源，没有工具三文件映射。现有18个builtin叶是原生Vue（前次只读报告已列精确表）；本片不把它们改为cfg。readLowcodePageFile:110-111与assertRemoteToolFilesAllowed:124-127明确阻止builtin工具远端来源；在真实三文件映射尚未确定前保留这种显式拒绝，不能删了守卫回退远端。实际存在的动态应用工具资源/版本目录/文件保存继续保留。

## 5. 有效 RED 设计（均未执行，先确认前提再由单写者补测）

### RED A：新建相同规范ID的工具可以发布且不改变身份

落点：blueprint-workspace-delivery.test.ts，使用现有正式导航DataView fixture，target显式cfg:tool-A，活跃工具tool-A，应用APP-A，当前三文件已加载且干净、导航/VersionId权限均满足。最好让activePageId来自真实ProjectBlueprint投影而非独立字符串。调用真实saveDelivery入口，快照下沉至PageToolFilesDataView或可核参数的真实链。

断言：三个快照目录均APP-A/tool-A，PageTool仍tool-A，NavigationUrl仍cfg:tool-A，只更新VersionId；重开仍同工具。目前必在BlueprintWorkspace:197拒绝，snapshot次数0，是产品矛盾而不是权限/未装载夹具失败。这个RED无需先为旧二段格式作迁移决定。

### RED B：本系统发布形成的二段值必须经同一正式链消费/明确诊断，不能各层矛盾

使用当前发布已形成的cfg:APP-A/tool-A、正式node.projectId=APP-A，贯穿assembleLowcodeRuntimeNavigation→DynamicRouter/PageRuntimePool→readLowcodePageFile（只stub底层文本API，不替换语义reader）。当前会产生pageId APP-A/tool-A并在toolFilePath:598拒绝。若冻结“已知旧发布locator明确映射”的方案，期望唯一读取APP-A/tool-A且PageTool.pageId=tool-A；若冻结显式不支持旧值，则期望在统一解析阶段给出明确迁移诊断、0 IO，不能先注册一个注定失败的工具。两种期望不可同时留下运行分支；后者是待合同选择的RED，不能预先把某一种算已核需求。

### RED C：工具目录所列身份能作为正式文件/版本查询参数

落点：project-tool-resource.test.ts / project-tool-version-resource.test.ts。以同一真实蓝图投影包含cfg:APP-A/tool-A或已批准的旧映射，查询ProjectToolCatalog后把该行pageId原样交给ProjectToolFile和ProjectToolVersion。现在catalog输出带/值，后两者identity拒绝。期望取决于已冻结格式：正确映射成同一个单段ID并读取同位置，或catalog在源解析阶段明确拒绝无效项；不能输出“可用工具”再在消费时变成非法参数。不要手工将catalog行改写成tool-A。

### RED D：发布不要求未修改导航字段的写权限

在A闭环修复后，以当前正式查询NavigationUrl可读但不可写、VersionId可读写且真实工具身份相符；只发布快照指针。应能写VersionId且导航值不变，不能将NavigationUrl写入changes。当前deliveryAccess:114拒绝。此例依赖冻结发布仅改VersionId的语义，属于同一变更的权限回归；不是放开未授权字段。

### RED E：解析一致性和隔离（部分应先GREEN作为回归）

同一个APP-A/node-A/cfg:tool-A在开发树、catalog、runtime/meta.tool、file owner身份一致；另一APP-B同名tool-A独立，不能复用缓存/owner。两个node不同scenario调用同工具，仍是不同runtime实例且同三文件语义身份。保留已通过的project-model:85与dynamic-router相关用例，不伪报RED。对cfg:tool?x、cfg:/tool、cfg:APP-B/tool、编码/反斜杠/dot path等在冻结后的统一入口作明确拒绝或已定义解析，校验在IO前；现有tree去?而runtime全slice的差异可直接暴露，但未确认“cfg允许查询字符串”的正式目标前，不凭空要求支持它。

## 6. 修正时应删除的错误分支与必须保留项

明确应替换/删除：

- BlueprintWorkspace.vue:192-194“cfg后缀就是storage customPath，否则拼当前app/page”的双重解释；:212发布写回cfg:${customPath}；相应不再修改NavigationUrl的写权限门槛。导航目标改变应独立业务操作，不夹带在发布。
- lowcode-runtime.ts:247、NodeTargetConfig.vue:31、project-blueprint-tree.ts:12/43为工具身份各自slice/trim/去?的重复解析，改为同一正式工具解析结果。normalizePageIdFromPath同时用于system-page摘要，不能全文机械删除它；仅移除作为cfg身份的错误用法，保留原生页正式URL摘要语义。
- 只证明一层字符串的错误成功断言与彼此不一致的fixture身份：尤其发布fixture的cfg:APP-A/tool-A + activePageId tool-A组合、runtime shared/orders“投影即可运行”的隐含推论。保留测试真正要验证的场景参数独立、发布部分成功与unknown语义，改用真实贯通身份。
- 如为旧值确立显式迁移后，应删除被替代的旧运行解析，不留读不到尝试另一路径或隐藏别名。

必须保留：

- 单段ID与customPath精确对应、应用X-AppId检查、DataSet/DataView提交、原PageTool owner及保存未知状态；这些不是造成冲突的错误守卫。
- 普通动态应用的远端工具读取/工作保存/快照/恢复/版本目录、VersionId指针消费及跨节点同工具调用；不能因builtin正在合仓删掉。
- Vue原生页面注册及nodeId路由、scenarioId调用、程序/__tool入口和场景历史独立合同；不将N__pagedata与工具发布VersionId混成一种版本。
- /__page/<nodeId>是运行投影；tree.ts:43还把存储导航中的/__page/后缀作为pageId。它是否有真实旧消费者本轮未核，须先核存量再删，不能把运行生成URL反向当工具身份。

## 7. 未核项与验证边界

- 未读真实远端导航/文件目录，故不知道当前有多少cfg单段、app前缀二段、任意多段值；不假称这些值都是可迁移的旧发布产物。
- 未运行上述RED，失败结论为基于确定分支的静态预测；测试必须使正式DataView权限/owner/文本基线就绪，主控独立确认失败原因后再开放实施。
- 未核历史项目是否依赖层级工具ID；pageId公开JSDoc只约束稳定身份/非空，单段来自当前真实可写IO，收窄公开声明须配消费者审计。
- 未核发布时当前导航改绑迟到的全部场景；应沿现有assertTarget和正式DataView保存回执保持身份核验，不扩大到本报告外的完整发布重构。
- 未决定builtin三文件新资源的物理目录/版本存储/发布持久位置；没有真实三文件映射清单就不应扩展manifest或打开远端fallback。
- 本次没有新造计划、配置或文件映射，只提供当前源码事实、最小方向和需要冻结的边界。
