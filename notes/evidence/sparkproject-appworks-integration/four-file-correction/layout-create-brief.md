# 缺失布局首次创建及重开验收

状态：implementing；同一 notes/plan-appworks-four-file-integration.md 的 D13。只读报告 layout-create-research.md 已主控复核，下方实施裁定优先于首次只读委派。上一轮图编辑已通过限定本地验证，不重新实施。用户持续授权低阶实施、主控裁决和验收。

## 当前只读委派

先核参考原行为及当前精确可复用链，向主控报告后在此 brief 裁定实施范围，不先改生产/测试。

- 参考仓只用 E:/r/sparkproject 固定 SHA 842dec4f11b333df904b9a4e26b6566b0802bab8。入口为 apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/use-data-set-design-page.ts 的 prepareLayoutRebuildPreview / confirmLayoutRebuild，追其直接领域 owner、fingerprint/模型关系生成、文件仍缺失检查和上传模式。区分原行为/原缺陷。
- 目标现有 src/lowcode/data-space/lowcode-data-space-layout.ts 只有 expectedContent:string 的已有布局 writer；packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts 的 uploadWorkingText 可覆盖，uploadTextVersion 禁覆盖并检查实际文件名、逐字节回读。不要按方法名字断言可重用，需核实际后端行为及路径。
- 四文件图已经有合法原文和本地草稿链；缺失文件为 null，与空图、损坏文件分别处理。需要“缺失 → 当前正式模型/关系只读生成预览 → 用户明确确认 → 再查文件仍缺失及正式快照未变 → 写入并回读 → 完整重新装载”语义。不得改模型/字段/关系记录，不得把完整关系过滤表达式缩成字段配对，不引入前端角色。
- 重点报告：原模型/字段/关系 fingerprint 的真实内容；当前 DataView 的重查询/完整权限读取方式；原图初始坐标/拓扑算法的必要语义；已有低层禁止覆盖上传能否用于首次文件，重名另存是否可能留下副文件；当前 PageContext 生命周期守卫及写未知处理如何复用。
- 交付精简 layout-create-research.md，列精确生产/测试文件、必要接口选择和需要裁定的真实缺口。当前不另造通用图/保存/权限框架，不创建源目录，不改后端/线上/分支或提交。所有业务页面入口仍在四文件，Vue 仅窄图预览。

## 验证要求

先最小 red/green；最终验证覆盖缺失预览取消零写、确认创建一次、存在/损坏拒绝覆盖、完整正式快照变化或权限/目标变化拒绝、保存未知不重复、成功后重新加载得到相同模型/边/坐标，并回归已有布局编辑。宿主/API用 HTTP边界验证上传模式及字节回读，根类型必须通过。

主控负责对照已有底层上传和部署/浏览器入口，无需执行者重复搜索线上环境。当前在线旧样板缺布局，见 graph-browser-readiness.md；这不批准直接部署或写线上数据。

## 主控已核低层文件合同

- LowcodeDesignFileUpload.uploadTextVersion 不限制文件名必须带版本号，其实际合同为 isReplace=false、实际 filePath 最终名必须等于请求名、再逐字节回读，现有 upload tests 覆盖重名另存拒绝。首次布局可复用该合同，不复制 multipart 或另造上传 API。
- 后端只读核查：E:/lowcode-jdk17/lowcode-file/src/main/java/com/htong/service/impl/FileServiceImpl.java:829 上传入口，:990 processFileUpload。文件已存在且 isReplace=false 时 generateUniqueFilePath 随机另存；但 exists 检查后是普通 Files.write，没有 CREATE_NEW，因此并非原子排他创建。禁止声称 CAS、严格无覆盖或自动回滚。前端能实现再次核缺失、false 上传、核实际目标和字节回读，不能弥补这个服务端竞争窗口。
- 实际文件名不同、上传/回读未知时提示未确认、保留预览证据且禁止自动重试，不删除后端可能生成的副文件。服务端并发缺口保留在验收风险中，不改只读后端仓。

## 主控实施裁定

### 精确范围

1. config/pages/data-platform/data-space-design/rule.json、script.js、style.css：缺失预览/确认/取消入口、可读概览与只读图、预览快照及生命周期、同一正式读取流程复用、创建/完整重载和异常呈现。
2. packages/spark-component/src/runtime/app-services.ts：在现有 PageDataSpaceLayoutWriter 增加 createDataSpaceLayout({dataSpaceId,content}) 及具名命令类型；已有 saveDataSpaceLayout 的 expectedContent:string 保持。创建与覆盖有不同前置条件，不能用 null 伪装已有布局。
3. packages/spark-component/src/page/context/buildPageContext.ts：对新方法复用现有 generation/abort/声明设计场景及 DataSet owner 门禁。script-context-types.ts 已与 PageDataSpaceLayoutWriter 相交，预计无需改；若只需类型导入调整，可在该既有文件内完成，不新增公共导出路径。
4. src/lowcode/data-space/lowcode-data-space-layout.ts：缺失复核后 uploadTextVersion，核目标及字节回读；只有明确 404 允许创建，现有空/损坏/合法文件均拒绝。仍使用同一应用/会话 scope，不假设文件写权限与模型字段写权限等价。
5. tests/runtime/page/design/data-space-design-four-file.test.ts、tests/runtime/page/runtime/page-script-lifetime.test.ts、tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts：行为与正式宿主/HTTP边界验证。
6. packages/spark-component/src/tests/runtime/createSandbox.test.ts、tests/runtime/page/catalog/data-space-four-file.test.ts：新必需 PageContext 方法的现有夹具补齐；未配置时明确失败，不放宽生产合同。已有 layoutWriter 测试夹具在上述文件内补新方法。
7. packages/spark-component/API.md：同步新增真实脚本 API、存在/缺失边界、未知结果和非原子限制。

不改 pagedata、图组件、低层上传 API、后端、依赖或线上。无必要不改 style/script-context-types。文档与日志写当前 evidence 目录，结果为 layout-create-result.md；保留待修改文件的本轮字节基线并记录准确位置。编译开工基线复用紧邻 graph-interaction-final-root-typecheck.log。

### 语义及流程

- 用当前已经核完整的正式查询投影生成只读预览；节点与模型 ID 集合、边与正式关系 ID/端点集合必须精确相等。空空间合法生成版本 1 空图。既有布局允许子集的读取合同不变，创建不得复用该宽检查冒充全集。
- 首次位置沿原拓扑分层与环/剩余每四节点的确定性回退，采用当前组件 232×120 的尺寸及原 102/86 间距、中心起点 250/150。同层按正式 rowid 确定排序；所有模型均包含。文件仅含必要图版本、ID/端点及几何，不复制模型/字段/过滤表达式/权限记录到图中。标题等显示仍从正式可读 DataView 取得。
- 指纹是**本页已授权查询投影**，不是不可见全表版本：覆盖目录行、参数行、模型、字段、关系的当前查询列，以及依赖字典。行按正式主键、对象按键规范化；每个字段先判 read，visible 才读取原值，隐藏/脱敏仅记录读取状态，不解析或泄露其值。必需身份/归属/端点仍按已有严格读取门禁；不额外要求所有标题/描述可见。完整 filter/ValueFun 等可见字段按原值纳入，不缩成字段映射。
- 提取并复用当前 reloadDesign 的同一正式读取链供用户重载和内部确认使用，保持原 query options/权限 owner/错误通道；不造第二 DataSet/查询来源。刷新会替换 rows，刷新后建立新有效快照再与预览指纹比较，不要求旧 rows 引用继续相同。预览对象及操作修订由本页持有；确认期间禁外部重载/取消/业务及布局写，目标/owner 变化拒绝迟到结果。
- 确认前再次读取正式快照及文件；任何可见内容/读取状态/集合变化或文件出现都拒绝写，提示重新预览，保留清楚状态。未经确认的预览和取消零写，不丢其他业务草稿；有 editing/pending/busy 时不得开始创建流程。
- 确认仅一次调用新宿主 create；底层返回意味着字节写入已确认。随后完整重新装载，核读到相同文件/完整模型关系。若写已确认但随后读取失败或快照变化，明确显示已创建但后续读取未通过，不伪报写失败或自动重试。上传/回读本身未知时锁定，要求用户显式重读，保留原预览证据，不自动删除或回滚文件。

### 本轮验证

先宿主最小 red/green，再页面真实 Renderer 入口与确认/取消，首个生产修改即对应最小复验。最终在修改冻结后集中根 typecheck → 精确 lint → 上述三行为套件及两受影响夹具套件；上一轮图控件未变，不重复单独几何套件。pages/ai 门禁由主控一次运行。

必须补真实页面重载/重挂载后从保存内容读到同一图的用例，不能只断言 writer 被调用。覆盖空空间、全模型/全关系、环/多父/断开分量、缺失/已有/损坏/404以外错误、确认前正式数据/权限/目标变化、创建期间生命周期失效、未知不重试。测试方法须真实经过 DataView/query/宿主边界，禁止直接伪造第二权限源。禁止将本轮通过称为整页或线上零回归。
