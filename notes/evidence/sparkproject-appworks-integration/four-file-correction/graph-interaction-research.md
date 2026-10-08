# 数据空间图交互研读结论

状态：只读研读完成，待主控裁定实现切片；未改生产/测试代码。源仓固定 `842dec4f11b333df904b9a4e26b6566b0802bab8`。目标为当前工作树八文件；按 AGENTS.md 0.2—0.7，图布局、正式模型/关系元数据与 DataView 编辑草稿分开。

## 原实现事实与缺陷

- `data-set-design-page.vue` 将 `SchemaGraph` 的变更交给 `handleGraphChange`，双击节点/边由 `SchemaGraph/index.vue` 分别打开节点/关系面板；单击只更新图的选中元素，页面未挂 `onNodeClick`/`onEdgeClick`。新边 `edge:add` 若有 handler 交其裁决，否则直接成为图草稿。节点配置面板维护四类配置，边面板按连线端点读写正式关系；图节点的创建/选中不等于模型元数据已创建。
- 原图 `node:drag`/`node:drop` 会更新模型坐标、画布边和绝对 `pointsList`：调整过的边从拖动前快照按移动端点平移路径，未调整的边刷新自动路径；drop 还钳制到画布边界，再异步通知图变更。自动排列先清旧绝对路径缓存，重排后发变更；聚焦/缩放只是视口操作。图变更仅改内存布局。工具栏“保存”用 `saveGraph()` 取整图，设 `graphVersion` 后调用 `writeGraph`；自动保存也可由元数据变更触发。原 `handleSaveDesign` 只凭写调用成功提示，未见逐字回读/原文预像校验；已存图不兼容时 `applyGraphDataOrFallback` 会捕获并以内存自动排布替代，易让用户混淆损坏与缺失。关闭属性弹层会卸载局部表单，节点/边切换的未保存草稿未见统一阻止或确认，不能照搬成安全规则。
- 图文档为带 `graphVersion`、`nodes`、`edges` 的 JSON；原节点/边 ID、节点 `x/y`、节点 `text`/`properties`、边路径/标签及图顶层扩展属性均可存在。`graphVersion=1` 是当前页可读合同，不能把组件投影的简化节点/边当作完整文件重写。

## 当前目标与可复用合同

- `rule.json` 的“关系图”页只有 `data-space-design-graph`，props 由 `designGraphBeforeRender` 提供；已有关系页的表格/表单有 `designSelectRelation`、保存/删除/取消。`pagedata.json` 的命名视图 `designModels`、`designRelations` 已足够，不因图操作改场景文件。`style.css` 仅给图 480px 区域。
- `DataSpaceDesignGraph.vue/.props.ts` 是实例隔离的 Vue Flow 窄组件，当前明确关闭拖动、连接、选择；节点 `x/y` 表示中心，传给 Vue Flow 时减半宽高（116/60），既有 `pointsList` 按绝对坐标绘制。组件测试只证只读图、路径与双实例隔离，尚无交互证据。
- `script.js` 的 `designParseLayout` 区分 `null` 文件缺失与损坏/版本不支持，核节点 ID/坐标及关系 ID/端点/路径；随后**只投影**节点 `{id,x,y}`、边 `{id,source,target,pointsList}`。`designLayoutText` 仍保留原文件字节串，现有关系保存通过读原文、比对 `designLayoutText`、原对象局部改边、`expectedContent` 写入来保留扩展字段。`designGraphBeforeRender` 用当前完整查询和 `fieldAccess` 投影可读标题；失效则隐藏图。已保存的空图可显示；缺失图不显示，损坏图禁止 ready/写入。现有 `designSelectRelation` 用正式行与 DataView 公共 `setCurrentRow`/`getPkKey`、`editActionState`/`deleteActionState` 进入编辑；切另一关系时正常草稿会 `designCancelRelation`，保存未知错误则挡切换。模型表单由 `designModels.currentRow` 和公共 `setCurrentRow` 定位；须从 `snapshot.views` 中以 `rowid/getPkKey` 核身份，不能凭图 ID 创建另一个模型真源。
- 主控已独立核宿主：`$page.saveDataSpaceLayout({dataSpaceId,content,expectedContent})` 有当前 PageContext/owner/scope 与精确预像、上传后字节回读且 success 门禁；不是 CAS。没有布局写许可 reader，前端不能把模型字段可写推成文件写许可，应让上传服务拒绝。当前 writer 仅接受已有合法文件的 string `expectedContent`，缺失重建另走显式路径。

## 建议的本轮闭环与待裁定点

先恢复“已有合法图：选择模型/已有关系 → 拖动模型调整 → 显式保存/取消”。窄组件只发 node/edge 选择、drag-end 的中心坐标与连接意图；脚本从当前快照精确定位模型/关系行，经 DataView 公共选择/现有关系编辑入口显示配置。拖动只形成布局草稿，不改正式模型/关系记录；对受影响的 incident edges 不能沿用旧绝对 `pointsList`，应只重算/清除这些边的路径，其他边和原 JSON 扩展字段原样保留。保存从原文局部合并节点坐标及受影响边路径，核 `graphVersion`、全体 ID/端点/坐标、当前查询与目标、原文字节预像，再调用已有 writer；写后复读/重开核坐标和边路径。取消恢复原文投影且不写；失败/结果未知保留草稿和明确状态，不自动重试，要求重读确认。连接新边只发端点意图；新增正式关系仍受未决新行字段权限合同，不凭图事件直接创建。已有边选中沿正式关系保存/删除闭环，不造第二套保存。

建议主控裁定两处：①图选择遇到模型/关系未保存草稿时，建议阻止切换并引导保存或取消，避免原实现的隐式丢草稿；②拖动后已自定义折线路径，是按移动端点平移保形，还是仅删除该边 `pointsList` 让图自动重算？两者都需真实组件路径验收，不能继续绘旧路径。剩余单列为缺失文件显式重建、连接创建、新节点来源配置、自动排列、边几何手调/标签及完整页面验收；当前页不能因最小闭环而删掉这些目标。

建议精确实现面：`rule.json`（图保存/取消入口及事件）、`script.js`（唯一草稿/校验/保存回读/选择编排）、`style.css`（仅必要状态与按钮布局）、图组件 `.vue/.props.ts`（纯事件及坐标/路径展示）、两测试文件（真实组件事件与渲染页保存/取消/重读/失败）；`pagedata.json` 不预计改动。浏览器验收须在真实图拖模型，观察边不断裂；取消后复位且无请求；再拖动保存，确认 writer 一次、精确回读、重开位置/路径及扩展字段保留；模型/关系选择和权限/过期快照分支均验证。
