# 冻结修复窄复核：STATIC PASS / NO NEW BLOCKING（2026-10-29）

此结论替代下方初审NEEDS FIX；保留初审发现与RED经过。仅签source/parser/runtime/owner当前冻结范围，不签UI、标准树、全部consumer端到端。未重跑测试。root报告三文件146/146、parser/nav两文件55/55、typecheck0，并真实SPA动态HMR恢复4行2页面；这些为主控执行证据，本复核只读核源码和具体断言。

1. P1已闭环：lowcode-data-space-runtime.ts:128–140不再因共享7AB声明直接拒绝dynamic装配；只在builtin+7AB安装真实file executor，其余声明安装明确拒读executor，防dynamic偷偷读取仓内85行。BlueprintWorkspaceDataView:126–140改按project身份选来源；dynamic选择原有正式modelBinding的Base_NavigationInfo，builtin严格选择声明file，无DB fallback。场景配置仍单源共享，未新增另一份7AB配置。loader测试115–139加载真实完整shared7AB并检查DB model及file声明并存；Dev测试407–421在二表共存时检查owner.view指向原DB view、正式查询、owner.update/save与读回，不是仅构造成功。测试未直接触发dynamic file.view.refresh，但明确拒读executor静态可见；不为此已收敛修复扩面。
2. P2已闭环：owner:1086–1089把BeginGroup加回可读投影，仍逐字段hasOutput+fieldAccess，builtin28源不造值；Dev测试424–435实际将动态节点navigation.beginGroup=true映射到正式fixture行，经loadProjectTree后断言true，消除了旧白名单缩减。
3. crossref清理已闭环：lowcode-runtime.ts:601创建DataSet后立即进入try，缺default view、resource.bind异常、owner构造异常与load失败均到611 finally；owner未成功构造时仍destroy DataSet，成功时先dispose owner再destroy。导航测试252–270删除实际声明的rowid/SysId触发owner构造失败，捕获真实DataSet实例并断言destroyed=true；并非凭spy次数推断。DataSet.fromJson自身抛出尚无可取实例不属于本轮泄漏；owner.dispose当前不会持久写，不新增catch掩盖异常。
4. file executor/readonly无新增回归：resource身份、schema、无modelBinding保持；执行前后和fieldAccess/readFieldAccess/viewActionState均assertView，后两项现补scope检查；增改删/子创建仍disabled，写字段denied，无saver。owner各实际写入口assertWritable保持。当前没有改变普通dynamic保存协议或共享场景readText来源。
5. 数字类型有新增正式依据：已读取 notes/evidence/workbench-tool-mapping-20261029/formal-estimate-column-types.json，主控从动态Base_NavigationInfo p000 DataView取得Sum/Total为decimal，Manhour/DifficultyFactor float、Number int，支持file声明number。证据是当前模型类型，不能推断每条历史业务值正确；85×28原值无损结论保持。

冻结SHA256（本轮实际读取）：
- src/lowcode/data-space/lowcode-data-space-runtime.ts 23D292DD59D89280AED521CD02CEA7118CF47A68DD5B31DD0960C8711EEE8BD3
- src/services/project/blueprint-workspace-dataview.ts F77A96B4FA6A3732B9276F1C1E19B4F2A2F4C4B80DCAAF0B9369F2268347F3FE
- src/lowcode/lowcode-runtime.ts B31500F92B06FF1D18B3C1A30B3589FA518E0911A0937AE1E328ABFF1441C2E1
- src/lowcode/resources/shared/builtin-blueprint-node-resource.ts 14538B29E04126C1E2B88B26AED8373D367E322F8FB2D99456B9978231CA6169

---
以下为保留的初审记录（其两项阻断现已修复）：
# builtin 蓝图 source/parser/runtime/owner 冻结组只读复核

结论：NEEDS FIX，两项有正式触发链的阻断问题；未运行测试，不把写者GREEN或loader旧mock失败当作结论。范围为当前未提交 source/parser/runtime/owner diff，不包含尚在实施的UI/标准树。基线 HEAD 4c5f937c726bca92220684451289c6478213e2a8，唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。

## P1：共享7AB的仓内资源声明阻断所有普通动态项目装配

位置：src/lowcode/data-space/lowcode-data-space-runtime.ts:127–136，src/services/project/blueprint-workspace-dataview.ts:124–129。

实际触发：useDevState.ts:251–255 对任意 projectKey 建立 PageRuntime并装配 LOWCODE_APPLICATION_CATALOG_FORM_KEY；src/lowcode/lowcode-runtime.ts:695–708 的 scenarioViews.readText 按scenarioId解析已登记仓内资源，与是否builtin项目无关。这是既有四场景正式来源合同。当前 config/pages/application/project-blueprint/pagedata.json:151起无条件加入RepositoryBlueprintNode，所以动态项目也读取同一声明。

随后 definitionExecutors 检测到该声明，因 !isBuiltinApplication(projectId) 在134–136抛 BUILTIN_BLUEPRINT_IDENTITY。不是越权调用，也不是非法fixture。若只修loader，owner构造仍先依据repositoryTable存在进入builtin分支，再因projectId非builtin拒绝，形成第二个独立阻断。后续规划 headless（src/services/project-planning/project-planning-agent-run-provider.ts:178/185）、页设计 headless（src/services/page-design/page-design-agent-run-provider.ts:239/253）、Dev主树（useDevState.ts:271）同受影响。

有效RED：使用真实完整7AB pagedata（包含原Base_NavigationInfo、辅助资源和RepositoryBlueprintNode），传普通动态projectId与匹配X-AppId/scope，正式模型metadata fixture可装配。断言load成功、owner选原Base_NavigationInfo、查询范围限定动态SysId、原读/编辑/保存链仍生效，仓内85记录不能污染动态树。同时用同一真实配置断言builtin选file owner且不能写。另有一个owner层小例：同DataSet包含二表，dynamic构造必须选择数据库view，不因未选file声明拒绝。当前新增loader用例裁成builtin单表不能覆盖该真实路径。

最小修复责任：按当前项目决定哪个资源可实际装配/绑定及哪个owner被选择；仍校验builtin资源身份，不能把file表伪造为DB模型，不能改“四场景按scenarioId共享仓内配置”规避。普通项目是否保留不可用file声明或在装配时明确不选它，应在现有装配责任方收敛，不能再造一份动态7AB配置真源。

## P2：新28字段投影白名单删除动态原BeginGroup

位置：src/services/project/blueprint-workspace-dataview.ts:1087–1090（projectedRecords字段数组）。

旧数组包含BeginGroup，本轮用取证28字段直接替换全部来源字段集，删掉BeginGroup。动态正式queryFields仍支持该字段（同文件:15）；packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-wire.ts:125 对缺失值调用flag得到false。故正式动态行BeginGroup=1、具有导航信息时，loadProjectTree/treeProjection将原true降为false。不是builtin证据未含此字段的缺口，而是普通动态来源已支持字段被错误缩减。NodeStateConfig.vue:15仍有“开始分组”正式消费者；owner.nodeData:933–948与wire写回:82也保留此字段，造成同owner不同投影不一致。

有效RED：动态owner使用正式授权返回BeginGroup=1且有效NavigationUrl的行，loadProjectTree.navigation.beginGroup必须true；并核选中nodeData与treeProjection一致。缺字段/无读取权限仍按既有边界处理，不从builtin records补造BeginGroup。最小修复是在通用/动态树投影保留原字段并加本片需要的新字段，builtin继续仅输出其真实28字段，不能让builtin快照白名单成为全域可读字段上限。

## 已核成立的部分

- config/navigation/appworks-system.json 当前85条records与 notes/evidence/workbench-tool-mapping-20261029/builtin-blueprint-business-records.json 的rows逐rowid、逐28业务字段比较（含null/数字/字符串），差异0；无缺行。此比较仅证明迁入原值，不能证明旧业务数据本身正确或发布可运行。
- publishedNodeIds当前26，与HEAD旧nodes的26身份集合差异0。原title,parentId,kind,order、18叶URL及conid保持；8个Model节点以前未声明conid、当前投影为''，这是既有消费者接受的空值形状差异，未发现具体业务损坏。完整85 records是唯一节点字段源，26投影只列ID；未自动选IsShowAtNav=1的53行。parser:69–120校验根、85/26、父链、重复、发布祖先闭包与18叶；:159–164从records派生菜单节点。
- runtime导航授权链未修改为本地授权：原readNavigationAuthorizationDataView/GetNavigationMenus过滤保留；节点可见/注册可达不被当作DB写权限。
- RepositoryBlueprintNode声明resourceType=file、固定resourceId且无modelBinding；BuiltinBlueprintNodeResource.assertView:32–40再次核场景/表/view/资源，无DB身份。执行器:43–72按DataViewLocalQuery选字段/范围，正式rowKey，所有字段write denied、增改删/子创建disabled，无saver。不可据此宣称其他7AB DB资源也只读。
- owner mutation入口已显式assertWritable：removeLeafNode、moveNode、applyLeafMoveBatch、addRootModule、跨父/混合子新增、assertCanAddChild/preflight后实际addChildNode、update/updateNodeData/batch、saveNodes/save/saveSelectedNode/saveIds。addChildNodes入口委派跨父实现。cancel/dispose是草稿/生命周期动作，未发现需要当持久写拦截的绕过。原DataView直接操作仍受file executor query权限与缺saver约束。
- 辅助Prototype/Task/Relation等资源没有被这次85 records伪装成已迁入的数据，也没有本轮新造授权。7AB原其他表声明保留，普通动态消费者仍需它们；不能因为节点file只读就删除辅助资源。UI对builtin相关功能的不可用表达/旧入口guard尚属写者下一组，本报告不签全部consumer完成。
- readBuiltinProjectBlueprintTree（lowcode-runtime.ts:577–610）为跨项目只读引用从真实7AB取声明，只构造该file DataSet，加载完整owner树，并finally dispose/destroy；前后scope/AppId捕获未明显放宽。但完整runtime/shared7AB测试仍必须解决P1后覆盖，不能用这个单表辅助路径代替全部装配。

## 边界与SHA

未测试、未访问服务/UI/凭据、未改repo；loader六条旧mock第二undefined失败由root确认基线，本报告不将其定级。上述P1/P2已先发root/writer等待正式RED及修复。标准树另见TEMP appworks-blueprint-standard-tree-contract-20261029.md。

读取时SHA256：
- src/lowcode/data-space/lowcode-data-space-runtime.ts 315448BB708AC2BE9913D713DDA92F818AD04FC67E4865C0F5854D958DB1686B
- src/services/project/blueprint-workspace-dataview.ts 978000688DDE17A99D30BC2501DB87124CE4D3D54D479E16043D108BBEB01A7A
- src/lowcode/resources/shared/builtin-system-navigation.ts 303709FB68F9E37179C775708BB7421D9C04E42D88512AC2A6736A02FC782A76
- src/lowcode/resources/shared/builtin-blueprint-node-resource.ts 14538B29E04126C1E2B88B26AED8373D367E322F8FB2D99456B9978231CA6169
