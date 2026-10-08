状态：implementing

# D1a 数据空间正式目录列表

依赖 C2d2d/e/f 组合验收已满足；主控依据用户既有实施和裁决授权批准本4文件闭环。沿用已确认的功能等价、当前底座/UI、固定参考 SHA、前端范围与现有 API。首次列表闭环不等于完整 D1，不复制参考宿主或加入新的 HTTP 通道。

## 精确范围（4文件）

1. 新增 src/lowcode/data-space/lowcode-data-space-catalog.ts：LowcodeDataSpaceCatalog 拥有当前场景与执行域，使用 lowcodeApi.dataSpace.runtime.query 查询 Base_DataSet，并将原 context 权限投影为可安全呈现的固定列数据。
2. 新增 src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue：当前 Element Plus 风格的目录页，名称/ID搜索、分页、加载/空/错误状态；读取已验证 route.meta.blueprintScenarioId。
3. config/navigation/vue-pages.json：正式路径 /features/data-platform/data-set-management/ui/data-set-list-page → 新 source，scope=app、hidden=true、shellTool=false，保持由真实授权导航节点决定可达性。
4. 新增 tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts：真实 owner 与实际 Vue 组件的行为测试，网络可以替身；权限投影必须使用实际 DataSpaceQueryContext。

不得改 package API/权限策略、DynamicRouter、App、后端或依赖。src/views/app 当前2个子目录，control 为第3个；lowcode/data-space 当前3文件，新增后4；tests/runtime/auth-nav/data-space 当前3测试，新增后4。不新增 barrel、兼容别名或泛化目录框架。

## 必读事实源

固定参考 Git 对象在 `E:/r/sparkproject`，不在当前宿主 `D:/SPARK_AppWorks`。所有参考读取必须使用 `git -C E:/r/sparkproject show 842dec4f11b333df904b9a4e26b6566b0802bab8:<参考路径>`；不要在当前仓 cat-file 后误判参考不存在。主控已实际读取该对象，当前生产编辑仅在 D 盘四文件内。

先完整阅读当前 lowcode runtime、DataSpaceRuntimeApi/query resource/context/permission、查询参数/filter 类、vue-pages registry 及既有 DBMS 页的 UI 组织。固定参考只用 Git 对象 842dec4f11b333df904b9a4e26b6566b0802bab8：apps/appworks/src/data/api/data-set/list.ts、对应 data-set-list-page.vue、application-scope-binding.ts。研究锚点在 c2-review/data-set-list-research.md、d1-list-dispatch.md；它们用于定位，源码是事实。主控已复核 query/context/resource/permission 和参考目录 owner/页面，以及当前配置。

当前真实只读证据 c2-review/d1-live-query.json：正式 node/scenario 90A82E287930A234FEC3E687C94A93EA，可读 Base_DataSet；rowid 是正式主键；七列 name=canonicalName；两页5行、keys唯一且与rowid相同、后端total1184；Name contains OR rowid eq 搜索命中。该证据是管理员样本，不是受限用户/写入证明，禁止复制整行数据或凭据进证据。

## 查询合同

- 场景仅使用 route.meta.blueprintScenarioId 的非空字符串，URL query scenarioId 是独立调用参数，绝不回退。不存在正式场景时显示配置错误，不请求。
- 执行身份由 lowcodeApi.readRequestScope 提供；sysid 是行的业务归属，不等于执行 X-AppId。首切片没有宿主绑定/应用 selector，查询不加 sysid 筛选；后续 slice 才补齐参考唯一宿主绑定、应用选项与创建人名称。
- 名称 trim 后为空则不加 filter；否则 (Name contains name OR rowid eq name)。createtime desc，显式1起始page及合法size，服务端分页。使用现有 DataViewFilter 构造，不自己拼请求。
- 消费 context.rows/rowKey/fieldAccess/total/countReported；后端缺总数、查询异常或scope无效必须显式失败，不以当前行数代替total、不冒充空列表。
- 七个固定字段 rowid、Name、Type、description、sysid、createuser、createtime，每个单元格先调用原context.fieldAccess(rowKey, fieldName)。visible才可显示原值，masked固定遮罩，invisible不呈现原值。不得将未经投影的 rows 整行传入 UI 自动列/tooltip/attrs/export。
- rowKey必须有效、唯一且与本模型rowid一致；缺/重复/错误key为契约错误，绝不发明替代ID。内部key不可绕过该字段的呈现权限进入DOM属性。合法唯一key无权限快照时按现有默认allow，不能临时覆盖底层策略。
- 保留原查询上下文归属，不从显示值反建上下文；只读投影不得改变权限凭据或后端原行。类型/方法从现有公开 LowcodeApi/DataSpaceRuntimeApi 推导即可，不为应用代码新增包导出。测试可直接导入内部实际 context/table 构造夹具。
- 数据请求前后检查当前执行scope；UI独立请求代次防止同scope下旧搜索成功/失败覆盖新查询。组件销毁或owner/scope失效后，旧请求不得发布rows/total/error/loading；缓存页正常同scope活动仍保持自身查询状态。缺scope初次进入应能显示错误，不能无限loading。

## 页面与最小顺序

以已有 Element Plus/当前布局组织，保留可操作搜索、重置、分页；加载与空结果/错误明确区分，错误可重试。名称/ID搜索回第1页，页大小改变回第1页。原始创建人和归属暂显示ID时标签应明确，不能伪装已经完成名称解析。类型只在可见值上按 datasource/workflow/form 显示对应名称；其他值原样显示。日期不以无效时间取代已遮罩文本。

不呈现假的新增/编辑/删除/设计/复制API/绑定按钮。本闭环不发任何业务写请求，下一片单独接应用绑定/选项与CRUD真实回读。

1. 用 owner 行为测试复现无实现及所需 query 合同，写最小 owner 后立即验证。
2. 实际 mount 新 Vue 页面，验证搜索/分页、权限投影/错误/迟到结果；实现页面后立即局部验证，不能只测一个投影 helper。
3. 注册正式 source，registry/目录/代码门禁验证。不要为了把生产组件塞进自动 stub 测试而改实际UI合同；被验收的新页和权限 context 必须真实。
4. root typecheck先通过，再定向lint、新测试与现有registry测试、verify:ai-codegen、verify:dirs、verify:pages-config。主控之后一次build及真实浏览器名单/搜索/分页/返回标签验收，不由子代理跑全量。

必要的反例只为高风险行为保留有效RED：新请求先完成、旧请求后成功/失败不能覆盖；masked/invisible原始标记不得出现在DOM/属性；URL query不能冒充正式场景。不为每个简单文案/字段映射重复拆代码取RED。

测试夹具约束：tests/vitest-setup.ts 全局 el-table/el-table-column 替身不会消费实际 data，列 slot 仅给空 row。新的 DOM 权限验收必须显式关闭这些替身并用实际 Element Plus 表格，或在充分说明后用确实消费 data 的行为探针。不能把空表格没有泄漏原值当成权限测试通过。不要为本测试改变全局 setup。

## 完成回报与边界

报告4文件hash、命令/真实stdout/exitCode、只读行为和未验项，冻结等待主控。实际受限身份仍待安排，模拟权限测试不等于后端授权已经验收。完整D1还有应用绑定/应用选择/创建人解析、CRUD、设计入口、复制API与绑定查询；本片只签署正式目录列表。

不commit/push/建分支，不改知识库，不新增依赖，不后台等待未来稳定。范围或事实失效立即回报主控修订，不自己扩大。

## 生产验收修订：固定列必须显式投影

主控真实生产浏览器发现 runtime.query(sort) 最终 wire 不含 Fields，后端按默认主键顺序返回。已完整核对 DataSpaceQueryTable.projectSortFields：fields 未指定时刻意不合成字段集，以保留后端默认输出；原 query-parity 测试对此有明确断言。不能仅改底层为单一排序字段而截断所有其他默认输出，也不在此片扩大共享协议。

本页本就固定消费七列，因此 owner 的 query 应明确 fields=['rowid','Name','Type','description','sysid','createuser','createtime']，仍使用现有 sort。主控调用真实 runtime 带此七列查询成功，10行、Count1184、所有字段与合法rowid保留、createtime 实际倒序。限定修改仍为原 owner 与同一 test；新增测试必须把捕获的 options 交实际 DataSpaceQueryTable.buildRequest，验证七列与 wire Fields.createtime.OrderType='descending'，不能只断言 mocked runtime 的 options.sort。先运行该新增用例取当前实现的真实失败，再修 owner，局部通过后 typecheck+定向lint。主控重新 build/browser 最终验收。

