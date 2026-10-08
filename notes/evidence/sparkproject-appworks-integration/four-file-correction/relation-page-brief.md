# 关系编辑页面委派

状态：implementing；属于唯一总计划 notes/plan-appworks-four-file-integration.md 的 D11/D14 整页恢复。

## 依据与边界

- 当前仓 D:/SPARK_AppWorks；完整阅读根 AGENTS.md、knowledge 对应领域、当前本次拟改文件，反查消费者。其他人的混合改动必须保留。低阶实现，主控验收。不提交、建分支、重置、在线写入，不派额外代理。
- 固定来源 E:/r/sparkproject @ 842dec4f11b333df904b9a4e26b6566b0802bab8；git show 读取 apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/edge-panel/use-data-set-design-edge-panel.ts 及同目录 Vue 和引用 API。不要读变动中的参考工作树当真源。
- 语义报告 notes/research-data-space-page-semantics.md；数据映射 semantic-data-restoration-map.md 末尾已有字典、多视图保存依据；model-relation-expression-review.md 是关系底座已验边界。
- 配置驱动四文件；前端只有当次正式查询的数据权限，禁止角色/admin 放行。模型关系的完整过滤表达式与前端字段输入级联分别处理。本任务不添加 viewCascades。

## 页面 writer 唯一修改范围

config/pages/data-platform/data-space-design/{rule.json,script.js,style.css,pagedata.json}
tests/runtime/page/design/data-space-design-four-file.test.ts
本证据目录 relation-page-result.md（结果记录）

其他生产/测试文件不得改；发现阻点报告主控准确路径。主控另派 API/宿主 writer，不需要页面 writer 扩建公共 API 或第二查询/保存 owner。

## 需要实现的完整关系操作

1. 关系表清楚显示父/子模型注册名与关系身份。新增在同空间可读模型中选择端点；编辑明确 rowid，不按相同端点取第一条。稳定身份校验、取消本地草稿零 HTTP，未保存新增关系删除仅取消草稿。创建正式 rowid 按本仓已有 UUID 机制；不猜来源主键。
2. depType 正式字典选项，filter 复用 data-space-filter-editor 完整 wire codec；已有 cascadeDel 原值保留，新建按固定来源 0。没有源 UI 输入 cascadeDel，不另造开关。保持未知已存 depType 可见、不默认首项，不得因字典空/失败假装可选。
3. 子模型 JoinType / ForeignKeyFields / JoinFilter / PId 是独立元数据。原合法 JoinType 为 INNER/LEFT/RIGHT/FULL/CROSS；外键取可读正式子字段 Name；Join 三项全部空或全部填，PId 非空为正式父 Name。原 parentTable/childTable 写 MetaName 与 preview Name 冲突为已证源缺陷，应按正式 Name 保存。不要照搬源回写整条模型的多余字段。
4. 同一子模型可有多条关系；不得因字段配对或端点相同合并关系。Join 是子模型唯一配置：若现有 PId 属于另一父模型，必须显式展示归属并避免当前关系的编辑/删除偷偷清空或改写另一关系的 Join。将实际拟采用交互先报告主控；不能给模型关系增加单父限制。关系删除仅删除指定 ID，其他关系保留。
5. 页面表单与业务结构在 rule.json，script 只编排；使用现有 DataView 编辑缓冲与公开 API。关系和子模型先全部完成校验（含新增/删除动作状态、逐变更字段 read/write/required、身份与当前查询）再 stage，防止一侧生效另一侧失败。已有其他未保存编辑不可被混入或清掉；本地取消仅影响此 editor 拥有的变更。
6. 同一 designDataSet.saveChanges({views:[...]}) 精确指定 Base_DataModel/designModels/childId 与 Base_DataModel_Relation/designRelations/relationId（只包含实际变更）。正式回执要核每个 view 和预期行数，后按相同目标精确回读字段/关系身份；无改动不可假报已保存。失败、partial、unknown、回读失败保留具体状态并锁重复提交，不假设事务或自动回滚。
7. 选择/目标/查询代次变化、页面关闭、权限变化和迟到响应均拒绝旧操作。复用已有 snapshot 检查，保存期间不能借新 snapshot 接受旧回执。DataView 未就绪时禁用操作，不以空响应替代无权/错误。
8. 模型投影补 JoinType/ForeignKeyFields/JoinFilter/PId，关系投影补 parentTable/childTable，fixture 正式字段同样按真实合同补齐。现 DesignHttpClient 仅处理首保存命令，必须支持多模型实际动作及每模型回执/读回；测试不能手动调用内部 listener 冒充真实 UI 点击。
9. 元数据成功后更新当前关系显示与图；新增/删除不得留下重开无法解析的旧图。主控正核窄布局写入服务；保持已有节点坐标、边路径和扩展属性，图文件与元数据分别确认。没有布局时维持“文件不存在”状态，不借关系保存自动覆盖未知/损坏文件。读取/写入宿主合同最终由主控补入本 brief；在此之前先完成不依赖布局的 UI/编辑/元数据用例，不发布或宣称关系路径验收。

## 宿主接口约定（页面可据此接线，实现由主控另派）

- `$page.readDataSpaceRelationDependencyOptions()` → Promise<readonly {label: string; value: string}[]>。只允许已声明并装载设计场景的当前页面，读取当前应用会话的正式字典，不猜 scenarioId。dict 空、非法或 scope 过期拒绝。
- `$page.saveDataSpaceLayout({dataSpaceId, content, expectedContent})` → Promise<void>，expectedContent:string 是打开时已有合法布局原文；写前复核原文，既有上传 owner 写后逐字回读。这里只是客户端并发检测，不承诺 CAS。本闭环拒绝 null，不自动创建缺失布局。
- Filter 控件新增 `validation` 事件 `{contextKey,value,valid,message}`（由独立 writer 实现）；value 保留当前原始 string|null|undefined，合法空表达式 valid=true。页面必须匹配当前 contextKey 和原始 value，再允许保存；缺报告/失配/invalid 均阻止，不另写 parser。既有 change 事件合同不变。

## 验证与回报

- 根 typecheck 开工基线通过：relation-page-typecheck-baseline.log。不要重复全仓探索或全量测试。
- 首个实质修改后 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t <最小用例>`，修复该闭环再扩展。完成跑该整套与 graph 套一次；主控最终 typecheck/精确 lint/配置门禁。
- 页面真实渲染/操作、OR/常量/字段引用保存读回、Cancel 零写、add/edit/delete 和双模型一次请求、只改一侧不夹带、同端点多关系、其他父 Join 保护、只读/隐藏/新增拒绝/删除拒绝、目标切换、partial/unknown/回读不符锁重复、布局独立失败/重开均要对应证据。
- relation-page-result.md 记录已完成、精确文件/函数、运行命令及结果、未完成/失败与主控需裁定项；不要测试数代替完整语义。第一步先完整阅读并向主控报告实际 UI 方案（尤其新增 draft、Join 多父归属、布局），然后按上述已批准语义连续实现。
