# 缺失布局首次创建：只读研读

状态：research complete；待主控裁定实施范围。本轮只读固定源 `842dec4f11b333df904b9a4e26b6566b0802bab8` 与当前工作树，未修改生产或测试。

## 原实现事实与缺陷

- 原 `use-data-set-design-page.ts:847—905` 在加载失败区让用户先“预览重建内容”，后“确认重建布局”或取消。预览由同一 `AppWorksDataSpaceDesign` owner 的 `prepareMissingLayoutRebuild` 读取正式空间/模型/字段/关系/依赖字典并确认图文件明确 404；预览只读，不写。确认使用同一预览对象作不可伪造 token；owner 一次性消费、锁并发，校验图中节点 ID 与全部正式模型、边 ID/端点与全部正式关系一一对应，重新读取正式设计、比较 fingerprint、再核文件仍明确缺失，写后 `readBaseline` 读完整正式资料及图原文，核 `graphContent === content`。UI 将成功基线挂载，失败清预览并要求重读，不自动重试。取消只清预览。`data-set-design-page.vue:4—43` 展示空间、模型/字段/关系数、模型清单、只读图和“旧自定义坐标/连线标签无法恢复”。
- 原 fingerprint 位于 `data-space-design.ts:102—118`：将完整规范化 `dataSpace`、按 `rowid` 排序的模型/字段/关系记录、按 `value/label` 排序的依赖选项做递归对象键排序后 JSON 序列化。`inputParams` 不单独进对象，但包含在 `dataSpace.inputParams` 原记录中；预览另携带解析后参数。正式查询 `#readFormalDesign` 分别读唯一空间主记录、allPages 模型/关系/字典，字段用 `collectSparkQueryPages`；查询总数与行数不符即拒绝。每个正式 rowid 必须唯一、归属当前空间，字段须有模型，关系两端须在完整模型集。
- 原 `buildAutoLayoutGraphData` 用**全部**模型/关系生成版本 1 文件：关系父→子拓扑分层，源模型顺序同层排序；起点 `(250,150)`，层距为节点宽 `+102`，行距为节点高 `+86`，未分层的环/剩余节点按每四个一层回退。节点保存正式 ID、中心 `x/y`、文字位置与属性；边保存正式关系 ID、父/子模型 ID，默认 polyline 而无自定义 `pointsList`。预览传 `preferAutoLayout/includeAllModels`，不按普通画布的“隐藏数据处理模型”规则删正式模型。原 `layout?.x || fallbackX` 会误吞合法零坐标；原实现还用 `isReplace:true` 写图，文件缺失复核到上传间并非原子创建，可覆盖并发写入。这些是缺陷，不是应复制的合同。`confirm` 写后重新读取基线，但未再比较其正式资料 fingerprint 与预览；不能据此声称完整事务或 CAS。

## 当前可复用链与实际缺口

- `script.js` 正式 `reloadDesign` 用四个命名 DataView 的 `loadFromServer({allPages:true,maxRows:50000})` 读取目标、参数、模型、字段、关系；`designVerifyRows` 要求 `requestState=Loaded`、`rows.length=total`、可读身份/归属字段、正式主键相等及唯一，`designAssertReadCurrent`/`designSnapshotIsCurrent` 核 PageContext、目标、DataSet/DataView、行集合和请求状态。文件 `null` 被 `designParseLayout` 单独标成“未保存布局”；已存空图会有正常图对象；损坏文件抛错而不 ready。`RenderDesignLayout` 已显示缺失状态，但 `designGraphBeforeRender` 仅在图对象存在时渲染，现无首次创建预览或确认入口。现有 `designParseLayout` 对合法**既有**图允许模型/关系的子集；首次创建必须另外验证与当前正式全集精确相等，不能直接沿用宽合同。
- 目标 DataView 是正式读取/权限 owner，不能新建并行查询或从公开行重建权限；图预览只可读取字段 `fieldAccess(...).read === visible` 的值，隐藏/脱敏名称不可泄露。仅当身份、归属和构图必要字段在当前查询可读且 `total` 完整时可生成预览。现有加载列是页面需要的显式列，与源仓规范化记录全集不完全等同；若要证明“正式快照未变”，须以目标本次已获授权的完整查询结果/需要字段和 owner 状态定义稳定 fingerprint，再走**同一 DataView 查询管线**重新读取并比较。重查会替换 `rows`，使原 `designSnapshot` 失效；必须明确重建快照与预览 token 的先后，不能只比较旧 JS 对象或绕过当前权限。还须拦截业务 pending/editing 与布局草稿，不能靠模型字段写许可推论布局文件写许可。
- `PageContext` 当前 `readDataSpaceLayout(): string|null`、`saveDataSpaceLayout({expectedContent:string})`；后者仅合法**已有**文件，不能传 null 或把缺失冒充空图。`buildPageContext.ts:82—94,129—160` 已捕获 PageRuntime generation/abort、设计 DataSet owner，异步前后核失效。`lowcode-data-space-layout.ts:17—48,62—104` 还捕获应用 token、设计场景 scope；读仅把明确 404 映射 null。故首次写应经独立、窄的 PageContext/布局 writer 命令传递，复用同样 owner/scope 与目标路径 `designfile/SysForm/<dataSpaceId>.json`，已有 writer 保持原合同。
- 主控已核低层 `LowcodeDesignFileUpload.uploadTextVersion` 的实际行为：`isReplace=false`、核回执 `filePath` 最终名、按 UTF-8 原字节回读，可用于预定的首次文件名，不要求版本编号。后端重名可能另存随机副文件；底层 `Files.exists` 后 `Files.write` 非原子，故“再次读缺失 + isReplace=false + 最终路径/字节核对”也不能宣称 CAS 或严格不覆盖。冲突/超时/回读失败要保留未知结果与证据，不自动重试或清副文件；服务端上传仍是写授权裁决。

## 建议精确落点与待裁定

- 四文件：`config/pages/data-platform/data-space-design/rule.json` 加缺失状态下的预览/确认/取消入口与只读图，`script.js` 管预览 token、正式快照指纹、生成布局、重查比较和写后完整 reload，`style.css` 仅必要预览样式；`pagedata.json` 的现有命名视图足够，预计不改。现有 `DataSpaceDesignGraph.vue/.props.ts` 可用 `disabled:true` 只读预览，预计无需改。
- 窄宿主合同：`packages/spark-component/src/runtime/app-services.ts`、`script-context-types.ts`、`page/context/buildPageContext.ts` 增显式首次创建命令；`src/lowcode/data-space/lowcode-data-space-layout.ts` 实现只对 null 缺失可用的 writer 路径并复用低层上传。测试预计 `tests/runtime/page/design/data-space-design-four-file.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts`；低层上传已有 `packages/spark-lowcode-api/src/design/lowcode-design-file-upload.test.ts` 的禁止覆盖、最终文件名和字节回读证据，若真实 HTTP 边界还缺首次命名反例再定向补。`data-space-design-graph.test.ts` 预计无需改。
- 需要主控裁定的真实缺口：① 指纹字段精确集合：目标 DataView 的已授权投影与源仓完整规范化记录不同，关系过滤表达式必须完整保存但不写入布局边；哪些字段无法可读时应拒绝预览。② 完整重新查询与当前预览如何衔接：复用 `reloadDesign` 会更新快照并可能清预览，需明确确认期间状态和已存在业务草稿处置。③ 严格非原子上传的冲突/结果未知提示语与副文件证据边界；不承诺并发 CAS。④ 初始布局可沿原拓扑分层与中心坐标，但不带原始 UI 节点属性副本或隐含“隐藏模型”规则；需明确空模型、环与断开分量的确定性输出。

验收须覆盖缺失预览取消零写、确认一次、存在/损坏拒覆盖、正式快照或权限/目标变化拒写、未知不重试、写后重新装载身份/拓扑/坐标相同；既有图保存 64 项须回归。主控负责底层后端模式与浏览器入口；本研究未做线上写入。
