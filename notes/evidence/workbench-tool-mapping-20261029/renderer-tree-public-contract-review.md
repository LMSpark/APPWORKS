# RendererTree 公共补丁冻结窄复审（2026-10-29 09:33:36 +08:00）

结论：STATIC PASS / NO-BLOCKING。本轮未发现新增明确阻断问题；先前两项P2及根集合配置/请求隔离问题均已按本次最小范围修复。未运行测试、服务或UI；主控提供独立8文件141/141通过证据（09:28:52起，root-tree-public-verify-01）。该结果归主控，不冒充本审查者实跑。HEAD a6682cf5dbbb9d4148490a71a47d48934ad29b5d。

## 闭环依据

1. **drop生命周期/重入**：zero-code.ts:404–423新增flush:sync绑定watch及onScopeDispose，变更使旧dropGeneration失效；RendererTree.vue:121–132的pending与既有allowDrag/allowDrop合取，不覆盖调用方限制。旧回调finally仅自己的代次能解锁/刷新；A→B→A不复活旧操作。zero-code:200–225记录本次正式rows对象，443–444验证仍是同一批原rows，防同view同key重新查询后使用旧drop结果。测试211–353涵盖ABA、组件卸载但runtime仍活、原rows换同key对象。组件抑制后续默认move；已经由业务callback发出的命令仍归业务owner的scope/lifetime守卫，不宣称组件能撤回已发请求。

2. **编辑与排序投影**：view-tree-state.ts:218–278消费当前同view的rows/editingRows，复制为展示树；sortTreeProjectionRows:151–174以tree id定位原正式行，先fieldAccess(read=visible)再按现DataView.sortExpression与columns排序。任一兄弟排序字段不可读则该组保持原序，不利用隐藏值重新排序。新query/sort-expression.ts按明确列类型比较数值字符串、稳定多字段顺序；null/undefined先归同组，原不对称缺陷已修。未知列/不支持类型保留源顺序。无orderBy新配置、无领域字段硬编码、无页面排序真源。

3. **取消/失败重建**：zero-code:458–462从fresh同view投影重建，而不是把开始前rows恢复；因此成功callback置cancel后仍能保留正式editing patch。失败只重建显示，LOGGER error走注入logger，不改业务行。已有parent overlay/discard测试355–392；真正同父数字字符串2/10、10→1排序测试395–441不再依赖0→0单孩子断言。

4. **根集合**：types.ts:787–790保留单rootParentValue并增加精确类型集合；TreeManager:50–53、149–163检查数组与有限数值、拒双声明、复制配置集合；309–326按集合原值取根、null明确合并null/undefined、node id去重，不提升孤儿、不修改parentId。ScenarioViewConfig:731–749同步白名单与双声明/元素校验；dictionary-catalog新增真实ScenarioViewConfig→DataSet→重开覆盖。view-tree-state:200将treeConfig传入原table fallback，无新页面数组通道。builtin仍使用单真实根rowid隐藏根；dynamic才需要根集合。

5. **请求隔离**：data-view.ts:3637–3642从远端viewConfig投影删除rootParentValue/rootParentValues，toJson仍保留本地配置；dataset-tree-4-plus-7.test.ts:162–180检查真实HTTP参数无根配置且本地未丢。GetData路径仍经DataViewQuery.parse白名单和encodeDataSpaceQueryTree显式wire字段；TreeManager children/move等端点不spread树配置，没有新增后端协议。

6. **取消选择高亮**：zero-code:367–392在回调结束后按当前view.currentRow恢复native currentKey；真实ElTree测试110–138通过DOM click触发被cancel选中，断言A仍高亮、B不高亮。宿主业务拒选仍须主动control.cancel；本轮没有将业务拒选规则搬入通用组件。

## 测试与兼容边界

- `tests/ui/renderer/renderer-toolbar.test.ts:444–504`确实mount真实Element Plus Tree，无ElTree probe；检查原节点对象体系的同父编辑排序、discard与失败恢复。但失败drop通过修改显示children后 `$emit('node-drop')` 驱动；它验证native store重建，不是完整浏览器pointer/dragenter/dragend手势验收。主树消费者尚未冻结/真实SPA尚未验收，本报告不覆盖。
- cancel回调测试152–209验证0默认move和pending阻止拖拽；与独立overlay测试组合证明当前实现路径。尚无一个测试在callback内部执行真实BlueprintWorkspaceDataView relative命令；该业务整合留在消费者测试。
- 默认before/after仍是既有取目标父、index=-1语义；未宣称补齐默认兄弟定位。业务精确位置由已交付writer的relative命令与同一次fresh query处理，不扩本公共补丁。
- lazy无额外查询/全量补拉，新排序只使用当前已加载投影。任意嵌套children若不属于view.rows正式身份，排序保守不读取其权限外字段；不宣称给非正式嵌套数据新增全量排序或编辑能力。
- DataViewLocalQuery现输入缺列类型，保留原runtime-value比较语义；新typed临时投影算子不同输入合同，不为机械去重改所有资源/过滤查询。今后同类型调用可进一步内部合并，此处不列阻断、不新造框架。
- 所有克隆/Map只服务当前计算投影，不是第二DataView、全局cache、业务草稿或持久真源。数据写入与权限仍由原DataView/领域owner承接。

## 文件身份 SHA256

组件路径前缀：packages/spark-component/src/components/containers/data-views/

| 文件 | SHA256 |
|---|---|
| RendererTree/zero-code.ts | 4D7386E317214261B6B01ADBBFF39480939825A68186DC68029617C06702A0FB |
| RendererTree/RendererTree.vue | 8144A8EDC0F7415AD4994F4E0B3385981D41FC6DD74BC40FC36702D99B29E13D |
| RendererTree/RendererTree.props.ts | 533139D0B958C7D9114B66E8103B4A4BF660F077275CC149A490F0013BDF6664 |
| view-tree-state.ts | D2C8416325DBE96F91556CFC1A952C2AD7F29301549CEC3BFDCF419AE69C7243 |
| packages/spark-data/src/query/sort-expression.ts | F60394E8C9EA23CA5FB2249996FF290DF72FE93AF54CDF34A51098307DE88818 |
| packages/spark-data/src/node-tree/tree-manager.ts | 0E15CEA7EA35CFA00C2456618FFD199041F6354764C193AEC996E43A618318B2 |
| packages/spark-data/src/types.ts | 6C1C20699D77077697192EB666A4B6047CA7A637DDF5FD6115BFECB03BD95E29 |
| packages/spark-data/src/data-view.ts | 0E737819D0178C636F3EB3CD2A8A0D95F77395873A862BE444E8B36CE0424C1F |
| packages/spark-project-model/src/scenario/scenario-view-config.ts | 33A4130108B1A5D3BA93C2AB152ABD655DE43434C0109EB0E55F367D8BF30745 |
| tests/ui/renderer/renderer-toolbar.test.ts | 78037E36D0C4DC969C73A7198B2390801431B8EDBEE67556DB9BEF3AA8E79F11 |
