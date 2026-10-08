状态：implementing

# D1b 数据空间目录的应用筛选与归属名称

依赖 D1a 主控最终验收已满足，依据用户既有派工裁决授权批准。沿用当前宿主和正式目录场景；本片只有应用选项、所属应用筛选与名称呈现这一个读闭环。创建人解析、宿主绑定、CRUD、设计、API、影响范围后续单独接线。

## 精确范围

1. src/lowcode/data-space/lowcode-data-space-catalog.ts：在既有 owner 增加 applications()，返回安全的应用 value/label；query 增加可选 sysid 条件。
2. src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue：同 owner 读取应用选项，应用系统选择器、清除/重置，归属名称列；应用选项独立加载/错误/重试。
3. tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts：真实 context 权限与实际组件的应用筛选闭环。

不增文件/包/导出入口/公共底层协议，不改 C1/C2、共享查询 API、宿主参数或后端。生产修改前重读当前文件。现有 D1a 四文件不等于整个 D1 完成。

## 事实与约束

固定参考 E:/r/sparkproject Git 842dec4f11b333df904b9a4e26b6566b0802bab8 的 apps/appworks/src/data/api/data-set/list.ts、apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue；源码主控已完整阅读，执行者重读有关方法和调用。参考 applications 查询 Base_AppSystemList，同场景；query 是 (Name contains OR rowid eq) AND sysid eq。参考 unbound 模式允许空 sysid，不从执行 X-AppId 推导业务归属。

当前真实只读 d1a/lookup-feasibility.json 已确认本场景 Base_AppSystemList 的 rowid/AppDesc/AppName 可用，total1；平台目录有更多应用，两者不等价，严禁替换为 platform.listApplications。DataSpaceQueryContext.rows 未自动脱敏；每个字段依据其原 context.fieldAccess。DataSpaceQueryTable 无 fields 时不投影排序；D1a 已因生产验收明确七个输出字段，不得撤回。

完整阅读当前 runtime.query、query-resource、pagination、query-table、context 的相关调用；allPages:true 使用已有原始 rows/total 分页核验，再做权限筛选，不能自己逐页先筛选或用筛后行数替代 total。

## 设计裁决

1. applications() 使用同 owner 场景、scope；query Base_AppSystemList fields=['rowid','AppDesc','AppName'], allPages:true。请求前后与投影后检查 owner；不返回原 rows/context 到页面。
2. 每个原行 rowid/key 必须非空、匹配且全量唯一，先核对再过滤。rowid 不是 visible 的行不可作为 option（value 会进 DOM），不暴露不可读 key。label 顺序 AppDesc → AppName → 可见 rowid；每个候选字段必须先 fieldAccess：masked 输出固定遮罩并停止回退，invisible 不取原值，可考虑下一个允许可见字段；空白可见描述可回退名称。对象等非标量显式报错。类型与方法收束到原 owner，不建泛型 lookup 框架。
3. query 的输入 sysid trim 后空则不加条件；非空与既有 Name/rowid 条件按 and 合并。仍显式七字段、createtime desc、1起始服务器分页；不能把 sysid 放在 HTTP header/切执行应用，也不能接受 query.appId 冒充绑定。
4. 页面原 owner 复用，应用选项单独 revision 与 loading/error。初次构造缺 scope 必须可见错误；迟到 success/failure/finally 使用 owner/scope/active/revision 检查。只在场景改变时重新建 owner/拉选项；选项请求失败可重试，列表失败仍按原方式；不能把获取失败显示成“无应用”。
5. 选择应用后点击搜索从第1页查询；分页保留筛选；重置清空名称与所属应用并回第1页。选项加载/错误时 select 禁用，空选项清楚显示全部应用，不自动选第一项、不猜默认应用。
6. 归属列只用已投影 row.sysid 匹配安全 options，找不到保持该可见 ID；masked/invisible 的 sysid 原样遮罩/空，不得通过 raw 行另行查名称；标签改为“所属应用”。页面标题下说明范围由当前授权场景决定，筛选独立于执行应用。无新增写操作/伪按钮。

## 顺序与验证

先 owner 查询/组合 filter/原 context 权限用例 RED → 最小 owner GREEN；然后实际 mount 验证选项确实渲染、选择+搜索/分页/重置、应用失败重试、迟到选项不覆盖新场景及masked/invisible原key/label不进入DOM。mock 按 metaName 分发，别靠调用顺序误把 app 结果当数据集；原 D1a 17项继续有效。

最终 root typecheck，定向目录+registry测试，3文件 lint，verify:ai-codegen 和 dirs。不跑根/包全量、不 build；主控一次生产 build/browser 核对场景应用选项、真实 sysid 筛选、重置及返回标签保留。报告真实输出/exit/3hash并冻结。无新理由不重复已有验证；不commit/push/建分支/写memory或knowledge。

