# 数据空间图交互与布局保存

状态：implementing；同一 notes/plan-appworks-four-file-integration.md 的 D02/D13 完整设计页恢复。研读已回报 graph-interaction-research.md，主控裁定见下文，按持续授权直接实施。上一轮表达式目录与祖先引用已通过并冻结，见 expression-review.md，禁止重复实施。

## 本次研读委派

当前只研读、不写生产/测试代码；向主控交回准确语义与精确实现范围后继续同一执行者。根 AGENTS.md 0.2—0.7、语义报告 D02/D13 是约束。用户持续授权低阶实施、主控验收；不重新询问已确认的四文件或数据权限方向。

源仓固定 SHA 842dec4f11b333df904b9a4e26b6566b0802bab8，用 git show/git grep；重点 apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/use-data-set-design-page.ts 及图事件直接注册/保存依赖。报告必须区分原行为、原缺陷、当前平台合同与需要主控裁定的缺口。

当前目标文件：config/pages/data-platform/data-space-design/{rule.json,script.js,style.css,pagedata.json}；src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue/.props.ts；tests/runtime/page/design/data-space-design-graph.test.ts 与 data-space-design-four-file.test.ts。根 plan 已含这些整页范围；本次预计 pagedata 不需改，不为齐四文件强改。

回答：

1. 原节点/边选择分别打开什么上下文；切换时未保存草稿如何处理。当前可接 DataView 选中/关系选择的公开方法是什么。
2. 拖动节点改变哪些坐标/边路径，是否即时持久化或显式保存；原保存按钮/自动布局/取消的输入输出与异常结果。
3. 图文档真源格式 graphVersion、节点/边原 ID、x/y/position、扩展字段如何保留；缺失/损坏图与已存在图分别走什么路径。
4. 连接新边是否只发意图，如何进入正式关系表单；新关系仍受未决的新行字段权限合同约束，不能偷开创建。原已有边编辑/删除依然要恢复。
5. 给出本轮最小但可用的“选择节点/关系→拖动调整→保存并重读/取消”闭环及真实组件验收动作；列明确剩余缺失重建/连线/自动布局语义，不能用当前已有 API 缩减总目标。

主控正核现有 $page.saveDataSpaceLayout 与 readDataSpaceLayout 的作用域/保存合同，你不重复深挖宿主/API或修改它们。已有 writer 只接受合法现有 expectedContent:string；缺失文件创建尚未接，不假定可自动覆盖。前端无角色，不按账号放行；布局写授权最终由现有上传服务执行，不能发明模型字段权限等价于文件写许可。

将精简结论写到同目录 graph-interaction-research.md（1—2页优先），回复主控真实阻点及建议，不重新造完整计划。不要发其他代理、改线上、提交、建分支或重置。来源语义和目标现状足够就收束，不扩大探索。

## 主控实施裁定

准确生产/测试范围：rule.json、script.js、style.css、DataSpaceDesignGraph.vue/.props.ts、data-space-design-graph.test.ts、data-space-design-four-file.test.ts 共七文件（完整路径见上文）；不改 pagedata、宿主、包接口。额外写本目录 graph-interaction-result.md 和验证日志。开工类型基线复用紧邻通过的 expression-final-root-typecheck.log；当前无他人写这些文件，修改前仍重读并保留字节基线。

### 用户任务闭环

- 图单击选择/突出显示、双击模型/已有关系进入当前四文件对应配置；节点按正式 ID 选 designModels.currentRow，关系按正式 ID 复用既有关系编辑。切页签通过现有 `$page.$components.getApi('design-tabs').setActiveTab(...)`，先核该公共 API 准确名称，不新造控制入口。不存在/过期 ID 拒绝。
- 切换编辑目标遇未保存模型/字段/关系草稿时阻止，并用现有状态区提示先保存/取消，不能像原关系选择那样隐式丢弃。只读数据仍可看图，编辑入口遵循已有数据权限，无账号判断。选择/双击本身不写后端。
- 拖动只产生本页布局草稿；现有图文件合法且快照当前时可进入布局编辑。图控件不做 I/O/权限决策；页面唯一编排保存、取消及原文局部合并。提供明确保存/取消和脏/错误状态，保存未知期间锁定编辑与重复提交。
- 保存沿已有 writer，精确原文预像、当前目标/视图/owner 再校验；成功以 writer 的上传和字节回读合同为据，并更新本页基线/投影。另一次读回若用于页面更新必须说明独立失败状态，不能把已写事实说成未写。冲突/失败保留草稿，结果未知不自动重试；重读须用户明确发起且说明本地草稿将怎样处理。
- 取消只恢复原文投影，无上传，不清 DataView 中别人的草稿。重新加载、返回目录、现有会重建设计快照的元数据保存/删除路径须检查布局草稿/写入态，防止无提示覆盖；优先复用本页既有阻止/提示机制，不造公共草稿框架。若实际容器生命周期必须新增公共合同，先报告主控，不扩大文件范围。

### 几何与持久化语义

选择保留自定义折线路径，不删除 pointsList 退回自动布局。主控已读固定源 packages/ui/optional/graph/src/design/polyline-geometry.ts:113 的 buildAdjustedPolylinePoints，及 polyline-runtime.ts:388/438 的拖动快照：移动一端时移动该端及相邻折点相应轴，自环两端一起移动全部点。未配置 pointsList 的边继续由当前 Vue Flow 自动路由。

源算法两点路径会连带移动固定端，是应修的缺陷：固定端必须不变，必要时补折点维持连通，不能照搬缺陷。零移动不制造脏状态；允许 0/负坐标，不复制原基于容器像素强制钳制的行为，因为当前画布支持平移/缩放。

组件内只保留一份纯几何计算，拖动预览与 drag-end 事件共用；可在事件中输出中心坐标和受影响边的新点列，脚本核上下文/ID/端点/有限坐标与修改范围，局部合并到从 designLayoutText 解析的草稿。不在页面再抄第二份几何算法。只改变实际移动节点的几何字段、相连边必要几何字段；原节点/边/点的扩展属性、text/properties、未关联边路径和顶层扩展应保留。文本/起终点若原文有明确几何坐标，移动时同步相关几何，不能留下互相矛盾的旧端点。发现格式合同不足先给具体示例，不猜未知扩展字段含义。

图事件须带当前 contextKey（目标空间与加载修订/草稿版本），过期事件拒绝；disabled/只读/保存中不发可执行动作。原始输入 props 不可被 Vue Flow 改写，继续保证两个组件实例隔离。布局草稿与关系布局写入共用同一文件，二者必须互斥/明确保存顺序，不能互相用旧预像覆盖。

### 验收

先加失败的真实图组件交互/页面入口用例，再实现，首改马上最小验证。组件覆盖中心坐标、开始/末端移动、自环、两点路径固定端、拖动过程中边连通、禁用/过期/双实例/输入不变。页面覆盖真实 rule→组件事件→草稿→保存一次→回读/重开相同，以及取消零请求、零移动、扩展字段/无关边保持、选择未存草稿保护、权限/过期拒绝、布局与关系写互斥、失败保留和未知不重试。不要用只改 vnode handler 或调 setupState 代替事件链。

最终两页面/图测试文件与精确 ESLint；主控统一根类型、pages/ai-codegen。真实浏览器拖动视觉检查在本地闭环冻结后单独进行，不用 JSDOM 声称已浏览器验收。暂不连接新关系（新草稿权限仍待答）、不重建缺失/损坏文件；这两项及自动排列/边手调仍留整页目标，不减少总范围。
