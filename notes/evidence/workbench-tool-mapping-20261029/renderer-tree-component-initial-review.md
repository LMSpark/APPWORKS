# RendererTree 公共组件窄审（2026-10-29）

结论：初审 NEEDS FIX，不能将现有 3 个 probe 测试视为生命周期和同父排序已通过。只读静态检查，未运行测试、服务或 UI；消费者尚未实现。读取期间写者已开始改动 Vue 与测试，下面 SHA 是各文件读取身份，不是原子冻结快照，修复后应再窄核。

## 1. P2：异步 drop 的组件生命周期与绑定代次未隔离

`packages/spark-component/src/components/containers/data-views/RendererTree/zero-code.ts:364–397`：dropGeneration 只在接收 drop 时递增，无绑定变化 watch、scope disposal 或 unmount 失效。await 后仅比较 resolvedView 对象、destroyed 和本次 generation。

正式可达：保留宿主 PageRuntime/DataView，卸载树组件；旧 onNodeDrop promise 返回且未 cancel，389 行仍执行旧 view.moveTreeNode。另 A→B→A 绑定返回同一 DataView 对象也通过检查。取消组件不表示已发出的领域请求能撤销，但尚未进入默认 move 的旧回调不得在释放后启动写操作。

旧 dropPending 是函数局部布尔值，不约束原生 allowDrag。pending 时第二次原生 drop 已 splice 视觉数据而369行直接 return。A pending→切B→B drop被忽略→A结束时397行跳过重建，可留下 B 的视觉移动与 B 正式行不一致。

最小修复边界：组件维护有效绑定代次及释放状态；绑定变化/释放使旧 continuation 失效。pending 必须进入原生 allowDrag/allowDrop 的现有组合条件，不能覆盖调用方规则。仅当前代次可解锁与重建，旧 finally 不得清新操作锁。保留默认无 handler 时的 moveTreeNode 行为。

有效 RED：实际挂载组件与活的 DataView，deferred callback，单独 unmount 树（runtime不dispose）后 resolve，断言 move=0；A→B→A同理；pending 时 allowDrag=false，回调后恢复原规则。当前 tests/ui/renderer/renderer-toolbar.test.ts:164–210 已出现 ABA 新用例，153–159 已出现 allowDrag 新断言；此次不声称已运行通过。

## 2. P2：同父顺序草稿在重建后丢失展示语义

`view-tree-state.ts:195–227` 将 editingRows 按 id 覆盖到 rows.map 的原顺序，再构造 TreeManager；`packages/spark-data/src/node-tree/tree-manager.ts:280–288` 按 parent index Set 的插入顺序返回子节点，无字段排序。`DataView.editingRows` 的公开说明及实现（data-view.ts:1673–1692）也明确保留 rows 顺序。

真实业务责任：`src/services/project/blueprint-workspace-dataview.ts:340–352` 对同父移动暂存 FunOrderValue；原树投影1061–1079按数字 order 和 nodeId 排序。标准树接该原 owner 后，callback cancel默认move、成功staged同父排序不改变prowid；最终refresh会回原兄弟顺序。正式编辑patch仍在，问题是展示与草稿不一致，不应修改 document/owner 真源补救。

现有“shows same-DataView parent and order edits…”测试214–250只有C一个孩子，FunOrderValue从0写0，只证明父节点改动/撤销，未证明排序。

最小正式路径：标准树提供明确的展示排序能力，消费同一 DataView 的有效编辑值；可复用已公开 SortExpression 的字段/方向结构（types.ts:559–574），按正式列类型比较并约定稳定次序，由业务声明 FunOrderValue、rowid。当前 TreeConfig 无排序字段，不能宣称已存在该API；不能硬编码业务字段。DataView.setSort（3678–3686）是查询配置与reload，并先检查可替换性，不能当成未保存草稿的本地排序工具。

有效 RED：同父C/D，正式owner.moveNode把D移至C前，handler cancel；断言 DataView原rows/原字段未改、editing patch有正确order、树次序D/C；discard后恢复C/D。另用数字字符串2/10验证数字列排序，不以字符串字典序冒充原业务。

## 3. 多根映射是接消费者前的明确能力缺口

TreeConfig.rootParentValue（types.ts:787–788）为单值；TreeManager.getRoots（295–296）只取一个父值。原 owner.treeProjection（1074–1079）将空串、'000000'、'0'三组正式根合并，只有单根时隐藏该根、多个根时使用非持久的 synthetic display root。

builtin 单真实根可用现有 rootParentValue=真实根rowid 隐藏根，不删源85行。dynamic多根不能取首根、不能改原prowid、不能用页面手传owner数组。最小标准扩展应显式表达一个根父值集合（含各值的精确类型和去重规则）或等价多根选择合同，在同view投影内合并；保持单rootParentValue默认语义，不能将全部孤立节点当根。该项是消费者接线前缺口，不是本轮声称已支持的现成prop。

## 4. 已成立部分与边界

- 当前 overlay 和 tree clone 是从本次 DataView rows/editingRows 派生的临时展示结构，没有新增持久草稿、全局cache或第二保存链；符合只消费同view要求。
- cancel后仍refresh可保留父字段staged patch，因为refresh读当前overlay，不强行回初始rows；失败也重新派生fresh树，不是反向修改正式行。
- logger走正式注入 logger.error；异常被捕获，避免节点事件promise直接冒到Vue。日志“was restored”在目标已换而跳过refresh时措辞过强，可改为失败/尝试恢复，不影响提交结果分类。
- 无编辑时继续用原view.treeManager；原嵌套输入继续按嵌套形态返回。lazy、默认拖放、字段权限、嵌套子节点和真实Element Plus DOM未作动态验证，不给全兼容PASS。新的callback委派业务命令仍须由owner核权限/目标身份，组件不能赋予额外授权。
- probe失败用例可证明input data重新派生及原行未变，但不能证明真实Element Plus拖拽、节点缓存、展开/选择状态无回归。正式DOM验收仍待主控。
- ClassModel zero-code shard已能检索TreeNodeDropHandler/onNodeDrop。生成物不作为源码行为通过证据。

## 读取身份

HEAD a6682cf5dbbb9d4148490a71a47d48934ad29b5d

| 文件 | SHA256 |
|---|---|
| RendererTree/zero-code.ts | 3B76DD84C38A0611EA96B830967EAB26ECFB9E4AF0E123AF7FC088EBC05B0DAD |
| RendererTree/RendererTree.vue | 8144A8EDC0F7415AD4994F4E0B3385981D41FC6DD74BC40FC36702D99B29E13D |
| RendererTree/RendererTree.props.ts | 533139D0B958C7D9114B66E8103B4A4BF660F077275CC149A490F0013BDF6664 |
| view-tree-state.ts | 864330E89E1118391F546CFC9E3D4E58611E5FA34466D1117DA84003CC9E5556 |
| tests/ui/renderer/renderer-toolbar.test.ts | 2F7D30C2E7365772B2387583558C49D2F7D1A8B1B9E6D8D0B12BCA172AB6EAAC |

以上组件相对路径均位于 packages/spark-component/src/components/containers/data-views/。Vue读取时已出现dropPending参数接线，而zero-code仍为旧局部布尔值，故勿用此中间态做编译失败或修复完成定论。
