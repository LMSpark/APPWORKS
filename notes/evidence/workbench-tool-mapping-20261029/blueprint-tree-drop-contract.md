# RendererTree 最小异步 drop 合同与显示回滚

> **历史分析，禁止作为当前实施合同。** 本文的 RED 建议和“未改代码、未执行测试”范围描述指向实施前状态；后续已在标准 `RendererTree` 加入可取消异步 drop、过期回调拦截和按当前 DataView 投影恢复显示。本轮复核 `tests/ui/renderer/renderer-toolbar.test.ts` 与 `tests/app/dev/dev-site-tree-move.test.ts` 为 38/38 通过。当前状态与剩余缺口以 `notes/data-space-retirement-ledger.md` 的 2026-10-29 树实施记录及最新源码为准。

结论：需要的是标准树内部“重新从当前DataView派生显示”的机制，不是回滚正式行、重新查询或操作Element Plus私有store。新可取消callback本身还不够：蓝图owner只暂存editing patch，当前树投影不消费editing，成功委派也会显示旧结构。以下为只读方案/行为RED建议，未改代码、未执行测试。工作树固定C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks；HEAD 4c5f937c726bca92220684451289c6478213e2a8，writer源码WIP，本报告不签其新增实现。

## 已核实际机制

- 本机Element Plus 2.14.2，node_modules/element-plus/es/components/tree/src/model/useDragNode.mjs:86–104：dragEnd先remove/insertBefore/insertAfter/insertChild，再emit node-drag-end/node-drop。node.mjs:163–169、196–204确实splice传入children数组。drop事件不是“尚未改变”的申请，不能仅return/cancel就认为原生UI已复原。
- RendererTree.vue:35–44直接把treeData交el-tree；view-tree-state.ts:48–65递归复制children后构成显示行，:179–199从view.rows/TreeManager构树。因此原业务行没有因原生drop直接改parent字段，但交出的computed显示副本会变。若DataView没有rows/config事件，该computed缓存仍是被原生改动后的结构；仅nextTick或父组件重render不会还原。
- Element Plus tree.vue_vue_type_script_lang.mjs:75–77监听data并调用内部store.setData；tree-store.mjs:58–64对新数组引用重建nodesMap并恢复currentNodeKey。公开返回API :181–211有remove/append/insertBefore/insertAfter/updateKeyChildren，没有setData。当前NativeTreeLike（zero-code.ts:57–80）也没有setData/updateKeyChildren。不能建议treeRef.setData、store.setData、getNativeTree().store等私有旁路。给el-tree一个从当前view新构建的data引用是已有声明式入口。
- 当前zero-code.ts:343–361不处理callback或失败恢复，直接view.moveTreeNode(...,-1)。DataView.moveTreeNode:3534–3538会更新TreeManager后syncRows；TreeManager.moveNode:366–399先等远程成功才更新cache（若无远程则本地cache更新）。应保留未配置新callback时这条默认行为，不把普通树全部变成蓝图命令。
- 蓝图owner.moveNode本次读取:320–358重新查询正式树、预检所有影响行，然后仅updateEditingValue(prowid/FunOrderValue)，不保存。DataView.updateEditingValue:2420–2456仅更新editingPatches并发editingChanged；view-runtime-state:177只增加editingRevision，:219固定rows；view-tree-state:179–199不读取editingRows，优先用旧TreeManager。因此需要标准树从同view rows+getEditingRow(id)派生显示，并监听editing变化/取消；不可用replaceRows将草稿灌成正式行，也不可调用moveTreeNode使蓝图变第二写路。

## 最小公开合同与责任分界

1. 在现有RTreeProps增加可等待、可取消的正式drop callback，复用cancel默认行为概念。建议事件载荷是稳定draggedKey、targetKey、dropType(before/after/inner)，可附只读显示行但不能把原生Node对象当永久身份。具体命名由实现确定；这是待新增合同，当前不存在。control.cancel=true表示宿主接管默认动作，既可能业务拒绝，也可能宿主已成功暂存；不能一律恢复drop前旧树。
2. 进入handler时同步捕获解析view对象、DataSet/runtime/绑定代次与keys，在任何await之前完成。宿主也捕获自己的owner/project/scope。默认分支只在callback结束后仍是原有效绑定且未cancel时执行，且只执行一次；同实例换key/owner或unmount后不得让旧默认动作落到新view。pending期间阻止第二次drop，组合而非扩大原allowDrag/allowDrop限制。
3. 蓝图窄编排用原owner行计算parent/index，再调用owner.moveNode。before/after使用原目标parent和按FunOrderValue/rowid排序、排除dragged的siblings定位目标index；inner使用targetKey作parent、排除dragged后的子项数作末位。这样无需猜原生childNodes字段，也不使用旧state.treeData被原生改动后的结构。owner仍负责循环/兄弟权限/identity/草稿和显式保存。readonly builtin拒绝拖放及命令，不触发默认moveTreeNode。
4. 组件在cancel、异常、成功后的settle统一从“当前有效绑定”的正式数据+当前editing覆盖重建新显示数组；不是恢复历史快照。这样拒绝无patch回原结构，成功暂存保留新结构，取消草稿后再回原结构。内部渲染revision只能触发重新计算，不能clone已经被el-tree改过的computed缓存；应从view源重新派生。重建只读，不refresh、不save、不discard草稿、不replaceRows。
5. 跨scope旧回调结束不能把旧树快照/选中/展开写回新目标；绑定切换自身重建，旧handler清理仅限自己的generation。当前行高亮从当前view.currentRow恢复；同scope尽量保留仍存在keys的展开/勾选/过滤（已有getCheckedKeys/setCheckedKeys、getNode、filter，expanded若需采集须在内部类型与原生实际实现同步声明）。缺失keys不复活。正式api注册本身不等于Vue ref expose。
6. 异常必须在组件事件边界完成恢复并有既有日志/宿主错误提示，不留下未处理Promise rejection。callback中业务拒绝可由宿主报告并cancel；不要引入新的持久补偿框架。修复公共组件声明后由正式生成器更新ClassModel；本次我无生成权限也未生成。

## 有效RED（先测行为，不能把不存在prop引发TypeError当RED）

A. **现有默认路径异常显示回滚**：mounted真实RendererTree+真实ElementPlus、正式DataView，按原生remove/insert路径模拟一次真实drop，使UI节点先进入新父；令既有view.moveTreeNode合法可调用但reject（权限/远程错误），发原node-drop。断言最终DOM父子/顺序等于原view，view.rows/dirty不变、无额外查询/保存、无unhandled；此例完全不需要新prop，当前有真实行为缺口。
B. **编辑覆盖独立RED**：同一真实view配置rowid/prowid，updateEditingValue把节点换父并更改顺序。断言正式rows未改而标准树显示草稿位置；discardEditingRows后显示恢复。这验证成功owner委派的底层前提，当前代码只监听rows/config会失败，不依赖新callback。
C. **新合同加入后测试“宿主接管”**：用可取消异步callback调用真实蓝图owner.moveNode。分别成功、预检权限拒绝、显式cancel、不抛异常但cancel；断言默认view.moveTreeNode=0，成功仅原editing patches、兄弟精确顺序且0保存，拒绝0patch/恢复DOM。before/after/inner至少覆盖同父前移与跨父，不能只检查handler被调用。
D. **迟到与重入**：hold callback，切完整key到不同view或释放，释放旧promise；新树行/currentRow不变、旧default move不执行，不恢复旧展开；hold期间第二drop不产生第二owner命令。read-only builtin即便程序触发drop也不写。
E. **默认路径保留**：不配置callback，合法默认moveTreeNode只调用一次且参数/结果符合既有规则；成功显示同步当前view，失败按A恢复。保留嵌套/flat及0/空rootParentValue基础行为。

现有tests/app/dev/dev-site-tree-move.test.ts:28–35用ElTreeDropStub仅emit单个data参数，:末尾仅断言state.moveNodeInTree被调用，没有原生先变树、失败恢复、精确index、正式行或草稿证据；tests/ui/renderer/renderer-toolbar.test.ts覆盖toolbar组合而非drop。二者不能作为回滚验收替代。无需机械搬旧组件stub形状。
