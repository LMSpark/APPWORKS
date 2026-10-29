# 主树 raw-row 动作接线补充（2026-10-29）

范围：只读当前源码；不改产品、不运行测试/UI。HEAD a6682cf5dbbb9d4148490a71a47d48934ad29b5d。此为消费者尚未实施时的保留语义提醒，不宣称新UI存在已复现回归。

1. 删除入口不再依赖 Element Plus parent.data。`useDevState.ts:1684` 参数已命名 `_node`，后续未读；1704真正调用 `owner.removeLeafNode(data.nodeId,data.projectId,data.parentNodeId)`。可删旧形参和 `ProjectBlueprintTree.vue:139–147` native node转发，不能为了旧签名伪造node对象。

2. raw row不是领域节点。标准slot给出原DataView行（rowid/SysId/prowid/conType/NavigationUrl），现动作接收ProjectBlueprintTreeNodeData（nodeId/projectId/parentNodeId/kind/navigation）。动作触发时从稳定rowid在当前同owner、同scope的正式投影解析，复用owner既有规范化/权限过滤；不要用类型断言或逐按钮另造字段转换。不得为取得nodeData临时切选中行，nodeData只对应当前详情（owner:921–958）。删除弹窗await返回后重新核同owner/scope和目标身份；不要拿旧slot对象去新应用同ID目标执行。

3. 选择必须取消标准组件的自动后续。`RendererTree/zero-code.ts:356–382` 在onNodeClick返回后默认setCurrentRowById；`useDevState.selectNode:1547–1555` 在场景history unknown、文件流程pending、DataView dirty时仅return。因此新宿主直接await state.selectNode仍会在拒绝后被默认逻辑改currentRow。宿主先control.cancel=true，再沿state.selectNode→owner.load→currentRow；成功由同owner设置，拒绝保持原详情与currentRow。owner已加载完整树时load:192–197只定位当前行，不把全树重查成单节点。真实原生高亮是否正确恢复须UI验收。

4. 行内动作不得诱发选择。RendererButton.vue:213在DATA_ROW作用域调用onClick(row,event)，旧ElButton的@click.stop不能原样复制；用正式第二参数event.stopPropagation，再调用加子/删除。选择、添加子节点、删除使用点击行身份，不能默取当前详情行。childCreateActionState仍收该rowid；新增子节点已有文件创建/补偿/unknown继续同父原命令（useDevState1647–1678），不可用raw slot重置pending。

5. 保留正式kind与交付身份。`project-blueprint-node.ts:59–63`先判断module/embedded/service，再处理cfg目标；`project-blueprint-tree.ts:40–43`只为page交付解析cfg或/__page/工具ID。不能看到Vue URL就把Model改成page，不能把原生Vue目录节点当三文件工具删。useDevState1687–1704对挂载cfg工具保留文件dirty guard、分阶段删除/待核验；普通节点保留owner正式叶子判断和权限。旧弹窗“含子节点一起删除”文案不等于正式级联授权，owner:291仍拒非叶。

建议最小新增行为覆盖：dirty/unknown时点击另一raw行→currentRow、selectedNode、activePage均不变；对非选中raw行点加子/删除→冒泡不选中，目标确为该行；确认弹窗中切scope→不删新scope同ID；Model+vue点击/删除不进入cfg文件链。复用原owner完整性/unknown回归，不重复15条旧owner测试。

# 相对拖放责任补充

建议named relative command `{nodeId,targetNodeId,position:'before'|'after'|'inner'}`，一个queryProjectRows（owner1285–1300）后计算位置；before/after先从目标兄弟移除moving，再定位target；inner追加到目标子列表末尾。保留现moveNode明确index调用，抽326–359共用同一次fresh rows的preflight/stage核心，不能relative先query再调public moveNode导致二查。初始dirty/unknown/readonly守卫、query后revision/selected/scope核验、完整total/闭包/可读字段、全受影响行字段write preflight、原DataSet显式保存及未知回执核验均保留。

删除 useDevState1727 的findNodeLocation(treeData)和仅此import；122、242、294、466–474桥改为转发relative命令，不计算UI index。其他领域findNodeLocation消费者保留。混合根的before/after需在owner按正式根语义计算，不能将标准显示集合值强写为prowid；现moveNode祖先遍历只识别000000，目标原始prowid='0'需明确处理，不能照搬后静默遗漏。

公开查询入口：model_query({kind:'BlueprintWorkspaceDataView',includeMembers:true}) → model_class_guide({kind:'BlueprintWorkspaceDataView'}) → model_action_guide({kind:'BlueprintWorkspaceDataView',actionName:'moveNode'})。工具参数真源 packages/spark-ai/src/class-model/tools/class-model-tool-specs.ts:37–100；目录 generated/dts-class-model/manifest.json，所属shard files/src/services/project/blueprint-workspace-dataview.ts.json（含method.moveNode.params）。新增命令后由写者走正式generate:class-model-surface刷新再查，不手改产物。
