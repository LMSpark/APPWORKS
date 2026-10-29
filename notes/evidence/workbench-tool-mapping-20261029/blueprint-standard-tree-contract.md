# Dev 蓝图标准树：窄合同与可行映射

结论：可用现有 RendererTree 绑定原 BlueprintWorkspaceDataView.view 展示平面85行；隐藏真实根显示84不需要新属性，已有 TreeConfig.rootParentValue 可以表达。不能只替换 :data 来源。动态蓝图拖放仍有明确组件合同缺口：默认 drop 无取消钩子且丢弃目标 sibling index，不能承接正式蓝图 owner.moveNode。无须因此为 readonly builtin 发明第二份树数据。

范围/身份：唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks，HEAD 4c5f937c726bca92220684451289c6478213e2a8；当前 builtin source/owner 有写者未提交变更，以下 owner 文件按本次读取版本。只读，无生成、测试、UI或服务执行。本文是可实施映射及待验证边界，不是实施完成声明。

## 目录 → 概要 → 指南核查

目录入口为 generated/dts-class-model/manifest.json 的 sourcePath/module/symbol 索引；读取以下正式 shards 的 module.component、models/typeAlias.declarationRelations、attributes/methods 的 JSDoc 和 $defs：
- generated/dts-class-model/files/packages/spark-component/src/components/containers/data-views/RendererTree/RendererTree.props.ts.json：r-tree / table-level / data-view-container，RTreeProps。
- 同目录 types.ts.json：RendererTreeApi。
- generated/dts-class-model/files/packages/spark-component/src/components/shared-types.ts.json：继承的数据定位/成员/字段合同。
- generated/dts-class-model/files/packages/spark-data/src/types.ts.json：TreeConfig，尤其 rootParentValue。
- generated/dts-class-model/files/packages/spark-component/src/components/fields/data-components/text/FieldText/FieldText.props.ts.json：RTextProps 的只读字段回退、displayFormatter；函数成员在 methods，不是缺失。
- generated/dts-class-model/files/packages/spark-component/src/components/containers/layout/action/RendererButton/RendererButton.props.ts.json：RButtonProps 的 dataViewKey、permAction、自定义点击等。

对照源码，树公开面与产物一致（树 shard generatedAt 2026-10-07；FieldText/Button 为10-28；时间旧本身不证明过期）。当前 git diff 对 spark-component/generated-dts 无变更。未发现本次所用属性在产物缺失，未执行生成器。docs/guides/TREE_CAPABILITY.md:16–47 是补充总览；其开头旧 ProjectWorkspace 编辑描述不能覆盖当前 owner/DataSet 真合同。

## 实际映射

1. **身份与宿主**。从本次 owner.view/dataSet 取得完整key：`${dataSet.scenarioId}@${view.dataTable.modelBinding?.modelName ?? view.tableName}@${view.viewId}`，经正式 buildDataViewKey 建立。当前 builtin = 同7AB场景@RepositoryBlueprintNode@default，动态 = 同场景@Base_NavigationInfo@default。新文件表不是后端模型，不伪造modelBinding。依据：src/services/project/blueprint-workspace-dataview.ts:116–145；src/lowcode/resources/shared/builtin-blueprint-node-resource.ts:5–6、32–40；packages/spark-data/src/core/data-view-key.ts:258–261。RendererTree.vue:139–146 实际调用 runtime.resolveView→提供DATA_SOURCE；view-data-source.ts:110–118 显式key必须有 PAGE_RUNTIME，不能用 state.treeData 兜底。

   DevSystem.vue:58 的 ProjectBlueprintTree 与:79 BlueprintWorkspace 是兄弟。后者 blueprint-workspace/BlueprintWorkspace.vue:55、116、123–143 提供/移除 PAGE_RUNTIME，不会自动提供给左树。新树宿主必须提供 state.blueprintPageRuntime（useDevState.ts:1823–1824已暴露），按owner/runtime/scope切换及unmount移除旧provider；只在同一已加载owner可用时挂载，解析后确认view就是owner.view。不可绑定当前活动页面另一个runtime、全局首DataSet或旧固定table名。

2. **行与层级**。树数据成员语义是绑定view.rows，nodeKey='rowid'，treeConfig={idField:'rowid', parentIdField:'prowid', textField:'FunName', treeMode:'flat', rootParentValue:真实单一根rowid}。owner保留全部85行，RendererTree经TreeManager构树显示真实根的84个后代；不删除根、不改prowid、不clone84行覆盖owner。依据 types.ts:782–804；tree-manager.ts:280–296、518–525；view-tree-state.ts:179–199。TreeConfig.rootParentValue只改变本地根组织，不改查询参数。只对已确认单一真实根采用该值；动态多根时旧 owner.treeProjection():1074–1079 返回 synthetic root，原UI展示各真实根，必须按正式根父值组织，不能把首个真根当唯一根。根/缺父/总数校验保留 owner:1285–1298。

   注意 RTreeProps 继承 dataMember/dataField（shared-types.ts:686–702），但 RendererTree.vue:139–146 没把 props.dataMember/dataField传给容器；view-runtime-state.ts:219–221固定取view.rows。可声明/理解rows用途，不能宣称传selectedRows/currentRow已被树消费。当前目标正是rows，无须为了本片重造成员投影。

3. **文案与原业务kind**。原节点标题来自FunName（空时name），URL来自NavigationUrl，类型来自conType经既有 wire normalize：Model→module，Navitem→page（packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-wire.ts:31–35、93–119）。不得用URL是否vue推断kind。标准节点children或default slot已存在（RendererTree.vue:46–67），内部RendererHostScope提供行；用FieldText readonly绑定FunName并displayFallbackFields=['name']，URL绑定NavigationUrl，kind绑定conType并纯displayFormatter映射原值。FieldText.props.ts:14–21 已有逐字段读取权限与格式化合同。不要手传title/url数组或直接读未经权限处理的row到标签。TreeNodeSummary虽已有nameField/typeField/metaField等，但TreeNodeSummary.vue:44–59直接读DATA_ROW原值，无fieldAccess检查；不能作为动态DB权限安全的替代。它也不自带正式kind归一化，不能传navigation.title等并假装字段绑定。

   顺序仍须保持数字FunOrderValue再rowid（owner:1072–1075），TreeManager.getChildren:280–288按索引插入顺序，没有排序参数。完整view查询/排序需由原数据责任方表达并验证数字语义；不能以显示无崩溃代替顺序一致。尚未核正式动态服务对该字段排序类型，不能直接假定字符串排序等价。草稿改标题后的FieldText绑定读取覆盖值应以mounted测试确认，不能依赖TreeManager旧cache自动等价owner.projectedRecords的edit overlay。

4. **选中/currentRow**。RendererTree zero-code.ts:315–332先await onNodeClick(data,node,component,control)，未cancel才setCurrentRowById。以点击rowid映射回同owner的当前正式节点，再调用现有selectNode/离开guard，拒绝、失败或scope切换时control.cancel=true；不可先让树改currentRow后才询问离开。允许成功时owner.synchronizeCurrentRow:1303–1310与树默认行为收敛为同一原行。RendererTree.vue:212–225监听currentRow并同步高亮。事件data是树显示投影，不能当正式DataRow对象身份；按PK+scope回查owner.view。避免把slot按钮event首参当MouseEvent：标准按钮行作用域可能首参为row，应按正式onClick参数处理。

5. **过滤和展开**。treeProps是公开的显式el-tree透传口（RTreeProps:46），允许defaultExpandAll、highlightCurrent、expandOnClickNode、filterNodeMethod。RendererTreeApi.filter(keyword)只调用原生filter（zero-code.ts:240–243），不会代调用DataView查询。现有搜索是本地标题/ID/URL显示过滤，不应改为重新查询owner并丢失完整闭包。过滤函数须从当前同owner行核read权限后匹配，保留祖先显示；不可搜索秘密字段造成侧信道。搜索框可用标准FieldText的modelValue合同（shared-types.ts:171–176）管理临时搜索词，不绑定成可写蓝图字段；它不是业务第二份草稿。应验证在提供DataView上下文但不绑定field时只发本地值事件。不要用RendererFilter的filterAlternatives来修改整树查询条件，除非明确改为另一个已授权业务搜索合同。

   标准树已有expandLevel/currentKey/expandToKey与API getNativeTree。expandToKey调用loadTreePath/expandTreeToNode（zero-code.ts:218–238），不是保证零网络的本地展开捷径。完整已加载树的初始全部展开可用treeProps.defaultExpandAll；交互“展开/折叠全部”通过注册的RendererTreeApi及getNativeTree已有节点能力实现，勿假设Vue ref直接暴露treeApi：RendererTree.vue:308只registerApi，useSparkComponent.ts:481–488只向PAGE_COMPONENT_REGISTRY注册，缺registry则不注册。树宿主须接正式registry或复用现有标准动作通道；不新增访问内部nativeTreeRef的约定。

6. **节点动作与readonly来源**。树actions/toolbar用标准RToolbarProps.children，节点内按钮继承同view+row。RendererButton的permAction=create/create-child/delete可收窄正式动作权限，自定义业务回调仍走原owner/state命令，不能换成普通delete-row绕过蓝图影响检查。builtin资源明示全部write denied、create/edit/delete/createChild disabled（builtin-blueprint-node-resource.ts:58–71）；UI应禁写/隐藏写入口且owner命令仍拒绝，不授予DB权。刷新、选择、展开、搜索仍可用。普通dynamic保持当前DataView查询权限及域校验。

## 真实缺口：动态拖放，不能通过透传伪完成

RTreeProps只有click/expand/collapse回调，无可取消drop回调。zero-code.ts:343–361默认drop直接view.moveTreeNode(draggedKey,newParentId,-1)，before/after均丢精确index；没有委派BlueprintWorkspaceDataView.moveNode。treeProps.onNodeDrop不会取消组件自己的显式@node-drop，因此不能用它叠加再保存，否则双路径。

旧 useDevState.ts:1726–1732 先读取已被el-tree改变的state.treeData位置，再调moveBlueprintNodeInDataView；换成标准树投影后该嵌套数组不再是拖拽结果，不能原样保留。最小责任边界是扩展既有RendererTree的正式可取消drop事件，交付dragged/target/位置及control，由蓝图窄编排解析原行、调用原owner.moveNode(parent,index)，阻止默认DataView.moveTreeNode；保留同parent排序及预检失败恢复显示、不触发持久化、显式保存。事件命名/参数是待设计的新合同，本文不冒充已经存在。随后同步ClassModel并测公共默认行为未破坏；readonly builtin设置draggable=false且owner拒绝write。

## 与数据空间目录树对照及必要验收

data-set-design-page.vue:46–52 已用标准RendererTree完整key和slot内RendererButton；:697–699通过control.cancel阻止被拒绝的选择。该页:687–695把“空间/模型/视图”混合导航节点转换为专用只读navigationView，这是不同语义导航资源；Dev已有正式node owner，不能复制其replaceRows思路另做蓝图数组真源。

本片最小行为证据：完整85行/显示84/不改记录、展示顺序与原kind；builtin与dynamic切换后key解析只命中当前owner；点击guard拒绝时currentRow和高亮不变；动态hidden/masked标签/URL不可泄漏或命中搜索；局部搜索/展开零业务写且保留全部owner行；readonly新增/拖放/删除均零写；普通动态before/after/inner精确顺序、兄弟权限预检无部分草稿、显式保存沿原DataSet；释放后注册/provider和迟到事件不复活旧scope。没有运行这些验收，不将建议当绿色证据。

SHA256：
- RendererTree.props.ts 9D24CC4D79463B451C00378751269122F4F8815EC394C525D1DE4DACBC61F8D8
- RendererTree.vue 0C4C27512D7102D0F524E507932DD132E00817C3B215D3788A907C9CE80F1F98
- zero-code.ts 925726F486E31D416C99E4636C5E09312D07AB957CE38744EFDEE6E48B77BDDD
- ProjectBlueprintTree.vue 270AA66A4CCDD9BB93265973061F5BF66B3EEF5794ED5FA4B59E848E429D3C7F
