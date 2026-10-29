# 目录工具三文件删除：断言迁移只读复核

结论：旧三文件的专属渲染测试可以退役；当前不能直接删除整个 `tests/runtime/page/catalog/data-space-four-file.test.ts`。它包含仍在使用的蓝图 owner 测试，并保有 native 目录尚未承接的业务断言。以下是测试覆盖结论，不是未运行的产品缺陷定论。

审查基点：HEAD 4c5f937c726bca92220684451289c6478213e2a8；唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。只读源码与测试，未运行测试、UI、服务，未写仓库。写者正在修改 builtin source 文件；本次未审该增量。

下文路径缩写：
- OLD = tests/runtime/page/catalog/data-space-four-file.test.ts
- CAT = tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts
- NATIVE = tests/runtime/page/design/native/data-space-design-page.test.ts
- CHAIN = tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts
- OWNER = src/lowcode/data-space/lowcode-data-space-catalog.ts
- PAGE = src/views/features/data-platform/data-set-management/ui/data-set-list-page.vue
均相对于上述唯一工作树。

## 已有有效替代，不必机械重写

1. 新增/编辑正式持久化、取消、无变化零写、编辑字段范围：OLD 1725–1786、2037–2079、2124–2143、2203–2226，对应 CAT 230–283、375–392、410–420。CAT 265–270 不是仅检查按钮：第二次从原保存入口核验，save 调用两次而 server.writes 严格为1，并检查正式回读值和退出编辑；272–278 对已确认写后回读失败，明确断言重试仅查询、save 一次。CAT 280–283 确认正式只读查询拒绝 beginCreate/beginEdit。尚不等于覆盖删除、隐藏但可写、必填矩阵。
2. 绑定基础链：OLD 875–908、943–956、997–1023中的缺父/循环、1069–1099；CAT 295–330、394–402 已核真实派生 DataView、原范围过滤、SysId/conid 过滤、完整祖先路径、空结果不查祖先、缺父/循环/隐藏prowid/错应用拒绝、关闭在途结果不发布、目录行 refresh 后旧路径失效、标准表绑定与释放。不是手传节点数组/只看同名按钮。
3. API 正式身份与输出：CAT 332–344/403–408 只证明委派目标、释放和复制返回值（session 是 stub），完整业务依据在 NATIVE 3237–3358 与 CHAIN 158–190：真实 session 的正式模型名/ID/主键/所有命名视图键、resolveDataViewKey 能反解原模型、失效/重复绑定拒绝、缺文件不补写、不泄漏内部别名及权限字段、无文件或 BatchTableOperate 写入；真实 transport 的字段 Name 脱敏导致 readApiInfo 拒绝并释放临时视图；字段页未加载仍经正式读取完成信息。NATIVE 3291–3333 覆盖设计页查询期间元数据变化、scope失效、实例隔离、释放以及剪贴板拒绝重试。不要把这组说成 catalog 页面所有异步末端也已覆盖。
4. 原独立设计路由跳转断言 OLD 841–874 不应照搬。CAT 434起核当前目录内设计器对话框的唯一目标；采用最新宿主合同。CAT 421起覆盖路由切换导致初始化迟到失效；CAT 463起有应用选项失败独立重试。OLD 的 RenderCatalog 控件结构、特定 prompt 次数/标签、初始化函数名、四资产渲染壳（1166–1313、1671–1724）可删除，保留其数据结果与权限语义即可。

## 删除前必须迁入或提供等价精确证据

A. **先迁出无关的蓝图 owner 套件 OLD 530–839。** 它真实创建 BlueprintWorkspaceDataView，覆盖 currentRow/edit overlay/cancel、字段权限、所有受影响兄弟预检无部分草稿、循环与隐藏树字段、移动取消/精确保存 IDs/readback、多叶移动+排序、部分回执 pending/拒绝 cancel、拖动非选中节点保留详情、迟到选择、缺父/总数、合成根映射、funCode、unknown 原 IDs/scope。已有 Dev closed-loop 套件覆盖创建、批次与绑定等相邻业务，不足以证明这些具体移动断言全部冗余。建议整组迁往蓝图 owner 测试并抽出所需 fixture，去掉对退役 catalog 三文件的依赖；其余去重在能逐条指向现存断言后进行。

B. **目录删除生命周期 OLD 1787–2035 未被 CAT 承接。** 全 tests 检索没有 CAT/native 目录调用 deleteSelected 的用例；其它数据库目录或文件删除是不同 owner。应至少迁入：正式 d 权限拒绝且零写；取消零暂存；确认期间选择/外部 refresh 替换同ID行/释放后不删除新目标；允许删除仅原 ID 和删除 payload，不夹带 add/change/私有字段；unknown 保留原 pendingDelete ID，切选后也不能重发或开始第二写，安全消息不泄漏隐藏 ID；确认后读取失败与未知结果区分；正式读回仍含目标不得报成功；末页最后一行删除后页码/Count/原过滤恢复。当前 OWNER 213–238 还有模型存在性检查，迁入 fixture 要实际驱动该正式查询，验证非空拒绝且不删场景文件，不能 mock 掉再称完整链。PAGE 166–175 负责确认入口，异步目标捕获断言必须落 UI + 原 owner，单测 canDelete 不够。

C. **绑定完整性/权限/失效尚有缺口。** OLD 909–942 真驱动502行、请求第1/2页、截断第二页不显示部分路径/假空；CAT 315–318 实际仅设置 count:false，不能称已覆盖截断后页。应迁入真实 allPages 传输链成功+截断用例。OLD 976–994 的所需输出字段 hidden/masked、1024–1055 的 duplicate/missing rowid及主键错配，也不能由 CAT 单个隐藏prowid/错应用代替。OLD 1100–1165 包括成功结果后 scope 撤销、蓝图查询owner结果替换、在途目录选中/同ID刷新：CAT 328仅测目录行 refresh、320仅测close，需在当前两个派生视图/目录owner边界承接其余有效断言。**不搬 OLD omitted conid 输出校验**：当前 OWNER 用正式 conid 查询过滤定位绑定，CAT 288–302 的返回字段本就不带 conid；检查范围过滤真实消费，而非强加旧客户端全树过滤结构。

D. **编辑权限交叉与身份边界未完整覆盖。** OLD 2080–2111：读不可见但写获准，不能把秘密值当初值；只提交本次获准字段；原null显式改空字符串仍是变更。2112–2123：后台required拒绝空值且零写。迁为标准绑定字段/原DataView断言，不保留旧 prompt 形状。OLD 2144–2202 的外部查询替换同ID行、切选与页面失效后的零写仍需目录专属用例：CAT 260标题虽写 query and scope，实际只换 scope token。CAT 221测试 designTarget stale 不是待编辑 save 的替代。OLD 2227起编辑后退出当前过滤结果仍成功且保留过滤也未有对应断言。CAT 230/255 已足以覆盖普通字段保存与零变更，不重做这些。

E. **API 的目录宿主末端及元数据拒绝矩阵。** OLD 1624–1670 将 clipboard.writeText 保持 pending，再更换 metadata结果/scope，断言已发生的一次复制不能撤销、但不发布旧成功；CAT 403只立即完成的stub，NATIVE 3291延迟的是定义读取而非clipboard。当前 PAGE 152–160 act 的 current 只核 owner引用/actionGeneration，177–183 是独立复制实现；应加当前目录 mounted 延迟clipboard的scope/owner变更与拒绝后可重试，不以设计页测试代替。元数据各关键字段 hidden/masked、foreign model/field ownership、全分页完整性（OLD 1319–1446）不能全部归为已有覆盖：CHAIN 158只直接覆盖字段Name masked，NATIVE 3279只改queryContext及草稿。按当前 session 实际所需正式字段，在 session/chain 集中补拒绝矩阵与完整分页断言；不要复制过期 API 文本格式或要求加载全部工作区。目录读不可见目标不得开session、读取期间目录同ID刷新/释放不得复制，要以原owner身份为断言（CAT 340仅清selectedRows）。

## 最小删除顺序与边界

先迁 A（保全正式 owner 回归）→在现存 CAT/CHAIN/NATIVE 补 B–E 的缺口（只迁当前合同仍有效的业务断言）→删除旧三文件及专属 fixture/render tests。可以合并参数化用例，不要求复制旧测试数量；每个保留业务断言须指到新的数据责任方与零写/精确写/身份失效证据。原 pagedata 与动态工具链不在这次删除范围。

本报告没有判定新代码一定存在上述缺陷，也没有把缺覆盖称为失败；对新fixture先确认正式链可达，再观察RED/修复。未全面审计通用DataView测试；若已有公共层精确覆盖，可引用其具体断言减少迁入，但仍须目录边界的关键接线用例。普通旧cfg库存不属于本复核。

审查文件 SHA256：
- OLD DDF6EA8D1A89F079F27B15601D344CE855ECCB5F90CEFF1537C85FEAD6C520D8
- CAT 1AF6A4346ACE2D4FE2ECBA67061E334F89378B87ABDF7048A0102C04C73257B8
