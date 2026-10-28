# 系统应用整体合仓补审（只读分析）

> 历史分析快照：以下事实以迁入前 f9fb6fe06 为基线，不是当前代码的实施指令。当前实现、真实验证和未完成项以唯一台账 `notes/data-space-retirement-ledger.md` 及 `notes/evidence/builtin-app-move-20261029/outcome.md` 为准；禁止据旧远端来源描述恢复已删除的入口。

2026-10-29；核对 HEAD：`f9fb6fe0626874c5db308cd7dcf8661ea4e4966b`。这是唯一台账的补充证据，未修改产品、测试、旧分析报告或台账。当前工作树已有上一切片新增 RED，本文不把这些测试改动归为本次实施。

## 最新执行顺序：先迁入生效源，移除被替代依赖，再编译迭代

用户最新指令优先于下方分析中的先后建议。首片直接复用已有 config 与页面，把系统应用的生效入口/场景来源迁入本仓，移除对应的仓外程序定义依赖后编译，按真实编译和运行缺口逐项修；不继续扩大先期研究。这里“移除仓外内容”指被替代的运行依赖/外部源入口，不代表删除正式 DB 模型、业务记录、整个参考仓或尚被 dynamic 用户应用使用的文件。

可开工的最窄改动面：

| 文件/责任方 | 首片动作 | checkpoint |
| --- | --- | --- |
| `config/navigation/vue-pages.json` 与 `config/pages/application/project-blueprint/pagedata.json`、`data-platform/data-space-catalog/pagedata.json`、`data-space-design/pagedata.json` | 复用已有文件为 builtin 资源真源；补已核系统入口与场景引用，不复制新同义文件 | 配置解析、正式身份和已有关系模式有效；缺项明确列出，不能 fallback |
| `src/registries/` 窄 source registry（拟新增文件） | 显式登记 builtin 程序资源及其仓内文件；复用现有页面 registry，不存第二配置正文或状态 | 同一资源只能绑定一个 source；dynamic 不落入 builtin 默认分支 |
| 现数据层的 repository 配置资源 executor（拟新增窄 adapter） | DataSet/DataView 先成立，再由 executor 加载登记的仓内配置；沿现有 ScenarioViewConfig/定义资源 | spy/负例证明 host 无直接读正文旁路，缺 repo 文件不调用 remote |
| `src/lowcode/data-space/lowcode-data-space-runtime.ts` | 显式来源分派后复用现 assembler/modelScope；保留 dynamic 远端 adapter | builtin 不读 D99/SysForm；源身份和正式 DB 查询身份分离 |
| `src/lowcode/lowcode-runtime.ts`、`src/main.ts`、`src/services/project/navigation/project-navigation-guard.ts` | 系统导航从仓内定义投影到现 RuntimeNavigation；homepage/既有真实应用身份与同一 selection fence 接线，dynamic 原路径保留 | 系统入口无需远端程序蓝图/配置才能注册；不新增 store/router、不直接篡改 application store |
| `src/lowcode/data-space/lowcode-data-space-catalog.ts`、`lowcode-data-space-design.ts` 及实际阻断的窄 consumer | 消费来源与读取上下文，不从 URL projectId 一律推定配置文件来源；保留正式 DB 操作所需真实 scope | 不能只改菜单后留 selected-app 守卫报错；不能为通过而统一去掉权限/生命周期守卫 |
| `config/README.md` 与相关活动架构说明 | 将“运行时一律远端”限定为明确登记的 dynamic 资源，纠正 builtin 程序真源归属 | 文档与实际加载无矛盾 |

第一 checkpoint 是：迁入→移除对应远端依赖→typecheck/build→修编译错误→首次真实 SPA 数据空间入口/配置来源核验。第二 checkpoint 是恢复完整读、编辑、取消、保存、重开、下游消费。repository writer 是第二 checkpoint 必补的开发宿主能力，**不阻止首片迁入编译，也不能因首片只读可用而宣布合仓完成**。不把全部长期页面调查、生产源码写入设施或未用到的远端 auth-only 文件读取设成首片门槛。

本工作树最新直接读取的 7AB 仓内文件仍为三表（SHA256 `66DF09176849E3ABAE161D223A7DDB694C6AB6DDC6AD4F5C255C08298B65E70D`），线上证据是四表；迁入时按真实差异保全 ProjectToolVersion，不假定两份完全相同。该差异可在迁入片修正，无需重新研究整个体系。

## 1. 纠偏结论

当前完成的是本仓前端源码、包、组件与页面注册的整合；**系统应用的导航定义、有效场景配置和启动决策仍依附远端 lowcode 应用链，整体合仓未完成**。不能以 Vite 正在本仓运行、页面 source 指向本仓或构建无仓外源码引用证明应用已经完整合仓。

同时，D99 是真实正式应用 ID，URL 带 D99 本身不证明程序部署在仓外。合仓不要求伪造新 appId、改写所有 URL、复制数据库或删除后端应用。真正要归入本仓的是系统应用的程序定义及其维护/发布链：系统应用入口、导航/页面调用身份、页面定义、场景/资源绑定配置、必要的流程和执行器。后端登录、正式模型/字段、业务数据和既有授权继续通过 SPARK data 读取/提交。

推荐复用现有 homepage 工场壳、RuntimeNavigation、SystemPageIdentity、PageRuntime、config/注册表和元定义 DataView；按资源明确 builtin 与 dynamic 的唯一来源。不增加第二 AppStore、router、业务缓存、角色模型或 host fallback。系统应用可保留经正式核定的 D99 等真实身份，程序来源不能再由该 ID 自动推导为服务器 SysForm。

## 2. 目前真实链路

| 层次 | 当前证据 | 判定 |
| --- | --- | --- |
| 进程与源码 | 主控已核 PID 25220/5273 是本仓 node_modules/vite；`vite.config.ts:88-110` 别名均为本仓 src/packages/src，`vue-page-registry.ts:62,174` 只 import `src/views` | 代码已合仓；进程事实来自主控本轮核验，本文另核源码，不重复归因为其它项目运行 |
| 页面登记 | `config/navigation/vue-pages.json:192-199` 数据空间目录指向本仓 Vue，但 scope=app、hidden=true、shellTool=false，未配置 dataSpaceId | 页面可加载不等于系统应用可独立提供入口/场景 |
| 本仓工场壳 | `lowcode-runtime.ts:105-122` 从 scope=tenant 页面派生 homepage；`tenant-scope.ts:17` 已有 homepage 身份 | 已有本仓壳和本地系统导航基础，无须新建应用壳 |
| 远端应用预激活 | `main.ts:377-388` 从 URL projectId 调用 activateLowcodeApplication；`project-navigation-guard.ts:68-90` 跨 scope 同样激活再 refreshRoutes | 当前系统页的应用入口仍交给远端应用选择链；不能只换 URL/菜单绕过其余依赖 |
| 导航定义 | `lowcode-runtime.ts:322-393` 根据选中应用装配 7AB，读蓝图 DataView、GetNavigationMenus，再生成 RuntimeNavigation | 远端 DB 蓝图仍控制系统导航。动态用户应用继续使用此合同；系统应用要有仓内正式来源 |
| 系统工具例外 | `withShellSystemTools():259-285` 可追加部分本仓工具，但目标业务页 shellTool=false | 不能开 shellTool 或挂一组静态菜单便称完整合仓 |
| 运行入口 | `main.ts:421-433` 的 readPageFile/loadScenario/loadNavigation 全接 lowcode；`:434` 平台导航分支禁用 | 本仓尚无完整 builtin 定义解析/装配路径 |
| 场景配置 | `lowcode-data-space-runtime.ts:88-102` 强制 selected X-AppId=projectId，读取 project gateway 的 pagedata | 即使配置改成语义资源 API，若系统应用仍只能读 D99/SysForm，仍未完成配置合仓 |
| 页面内部约束 | `data-set-list-page.vue:82-85,211-220` 从蓝图 route.meta 取 scenario，从 URL 取 project；catalog 与 design loader 都使用 readRequestScope | 改登记为 tenant 仍会因无选中应用失败，必须连带改装配/作用域注入，保留失效守卫 |
| 正式 DB | 空间/模型/字段与业务记录在服务端，运行由正式模型绑定查询 | 应保留；远端业务数据库不等于程序定义未合仓 |

源码文档也暴露了方向差异：`config/README.md:3-18` 一方面称 config 是仓库 canonical source，另一方面规定历史动态页面运行一律读 lowcode 文件；`docs/architecture/system-architecture.md:11` 把所有“应用”笼统列在后端。它们可解释当前实现，不能覆盖用户最新的整体合仓要求，实施时应同步精确区分系统应用定义与业务数据。

## 3. 已有 config 的实际边界

本轮读取到四份场景配置：

| 仓内位置 | scenarioId | 当前用途和核对事项 |
| --- | --- | --- |
| `config/pages/data-platform/data-space-design/pagedata.json` | 8D1AB14DD8277F3E7017CD38F77B09FD | 元空间定义，含五类 pagedata 定义资源及 DB 元模型；现 metadata loader 不以它为运行真源 |
| `config/pages/data-platform/data-space-catalog/pagedata.json` | 90A82E287930A234FEC3E687C94A93EA | 目录/候选等配置；DevSystem/工作流等仍有局部 import，但目录 runtime 依旧读取服务器来源 |
| `config/pages/data-platform/data-dictionary/pagedata.json` | 69B79AB779DF4C12A5595DACDF3283F1 | 字典 editor 已有直接 import，和其它入口的远端/host 构造混用，未形成统一来源规则 |
| `config/pages/application/project-blueprint/pagedata.json` | 7AB874097A1E8711A42FD845939A6E05 | 仓内仅三表；本轮正式远端配置有第四个 ProjectToolVersion，且 legacy 关系模式，二者不能未经语义比对互相覆盖 |

不能把这些文件存在当作已经生效，也不能把全部旧 JSON 原样晋升为正式配置。合仓需按模型/字段/关系/查询实际合同校验并合并有用定义；只保存 DB 模型引用及视图配置，不能把字段元数据或业务 rows 再复制成真源。仓内缺失的系统资源场景按正式绑定补齐，不恢复已撤回的旧实现或 characterization fixtures。

## 4. 推荐落点与唯一来源合同（目标，不是现有事实）

### 4.1 系统应用与用户业务应用的边界

系统应用指 AppWorks 自身交付的管理与开发功能：应用工场、数据资源、数据空间、服务/接口、字典/逻辑/结构化配置以及开发工作台等。不能只合数据空间列表。目录中的全部业务应用不因出现于列表而被转成 builtin；用户业务蓝图/工具/场景保持现有远端正式适配，逐资源审查其真实来源。

本仓建议沿现有目录承接：

| 定义 | 正式落点 | 运行与维护 |
| --- | --- | --- |
| 系统应用入口与来源索引 | 在 `config/` 增加一份窄应用声明，例如 `config/applications/appworks.json`（拟新增） | 仅声明已核应用身份、导航引用、页面/场景资源引用与来源，不包含执行代码、业务行或权限规则 |
| 系统页面代码/组件映射 | 保留 `src/views/...` 与 `config/navigation/vue-pages.json` | 注册表依旧唯一绑定组件 source，保留相对路径和已有页面标识 |
| 系统导航/调用节点 | `config/navigation/` 的系统应用导航定义，由应用声明引用 | 使用现有节点/导航合同及解析器；只补持久声明所缺的层级、节点 ID、场景引用，不另造 router。页面注册标题等可派生的不重复保存 |
| 页面工具三文件 | `config/pages/` 相应业务目录的 rule/script/style；原生 Vue 按现阶段合同保留 | 原 PageTool/PageRuntime 消费。共享场景不每页复制 |
| 系统场景视图/关系/资源绑定 | 现 `config/pages/.../pagedata.json`，一场景一源 | 原 ScenarioViewConfig、五类定义视图、DataSet.saveChanges 和装配器消费；源登记只引用文件位置，不再复制配置正文 |
| 执行逻辑/存储适配 | 原数据层与 `src/registries/` | 只把来源声明绑定到现有 executor/loader；不在 JSON 填可执行 URL/任意 JS 或绝对文件路径 |
| DB 正式元数据/业务数据 | 原服务端 DB | 仍由 SPARK data 查询/提交，不搬进 Git，不修改 Java |

应用声明的精确 schema 应在实施片先核已有模型，并仅增加当前确实缺少的字段。运行仍只产生一个 RuntimeNavigation 投影和一个当前应用选择状态。RuntimeNavigation 是壳的运行合同，不把后端授权凭据或其运行状态序列化为仓内权限配置。

### 4.2 来源显式、查询身份与程序身份分离

每个场景/页面资源在已验证的应用定义下只绑定一个存储来源。builtin 绑定仓库资源，dynamic 绑定现有远端正式来源；解析失败即失败，不按“先 local、404 再 remote”或“远端优先、本地保底”加载。同一 spaceId 若被系统应用和业务页面共同引用，必须仍指向同一已声明正式配置来源，不能按当前选中应用读两份内容。

例如 7AB 作为内置公共场景收归本仓后，所有对应 runtime 和定义编辑都应使用这一来源；原 D99/SysForm/7AB 文件可留作历史保全，但不得仍是另一条活动保存目标。其配置中 ProjectToolVersion 引用的远端项目文件是另一个资源，需保留正确 executor/目标输入，不能因外层场景改为仓内就把业务项目文件复制进仓。

登录 scope、执行应用、目标业务空间、配置来源分别保持真实身份。若现有正式后端操作确需真实 D99 执行身份，可保留该 appId 和既有应用 store/receipt；但系统导航和场景定义从仓内解析，不能因此继续访问远端应用程序定义。不默认把所有请求改为 auth-only；按实际业务 API 证明需要的 scope，继续使用既有 fence，不能扩张或绕过授权。

入口复用 homepage 工场和现有应用选择链。是否仍以 D99 作为内置系统应用的正式执行身份，应根据真实 API 合同和已确认产品身份选择，不以美化 URL 决定。保留原蓝图 URL 的业务相对路径、查询参数、工具/节点身份和导航语义；不批量改后端 URL，也不为摆脱 D99 字样另造假 appId。

若保留 D99，`LowcodePlatformApi.commitApplicationSelection():561-602` 当前必读导航根，需要按来源接入仓内正式导航根/应用定义解析，沿同一 selection fence 和 receipt 提交；不能调用 application.save 绕过该链，不能用虚构 root row 伪造后端授权。动态应用继续用正式 DB 根读取。哪一段根身份属于既有 UI 定义、哪一段操作确需后端数据核验，是首片应精确核清的接口，不直接删守卫。

## 5. 仓内配置可编辑保存：必须完成的适配闭环

当前查到 Vite 的业务相关插件仅组件注册、UTF-8 和 ClassModel 静态资源映射；在本轮检查的 src/tools/project IO 中未找到系统配置的 FileSystemDirectoryHandle/createWritable 或仓文件写入路由。构建脚本的 fs.writeFile 是构建/生成用途，不能冒充页面设计器的保存能力。**现有配置管理没有已证实的仓内写入宿主合同。**

建议补最小开发态 workspace 存储 adapter，复用现有 Vite 插件注入方式；它是本仓开发工具的文件持久化能力，不是 Java 业务后端，也不是第二套业务数据 API。产品/页面仍只有 SPARK data：

`标准组件 → 定义 DataView → DataSet.saveChanges → ScenarioDefinitionResource/ScenarioViewData → 文件存储 adapter → 本仓已登记配置文件 → 精确回读 → 真实 receipt`

对应最窄合同：

| 能力 | 必须做到 | 不能做到/伪称 |
| --- | --- | --- |
| 资源定位 | 从已校验的 repo resourceId 映射至本仓配置白名单；源版本/目标身份在查询时捕获 | 接受页面任意绝对路径、目录遍历、按当前 appId 猜本地文件 |
| 读取 | executor 内读取工作区真实文本，返回绑定身份和源 revision；生产读取同源构建产物，带确定构建版本 | host 先 import/读正文再包装 DataSet；把已读取种子当作另一路自动 fallback |
| 变更提交 | 沿既有定义变更捕获与合并，保留未加载/未改部分；比较查询基线与当前文件，单文件顺序写入、临时文件替换、精确回读 | 整文件旧快照盲盖新变更、跨源事务、创建平行草稿或可直接调用的 page.writeFile |
| 冲突/未知结果 | 保留原批次与基线，分别确认“已落盘/未落盘/冲突/未知”；未知只核验，不自动重发 | HTTP 成功就清 dirty，超时重复写，读回失败仍报保存完成 |
| 开发宿主边界 | 本机开发态显式注册，限定 workspace/root、资源与同源调用；前端来源能力与业务数据授权分开 | 新建 admin/role 放行、把可写本地文件等同于获准写远端模型 |
| 生产发布 | 从仓内配置构建不可变版本，构建产物只作派生部署物；源修改经原工程验证/发布进入新版本 | 在部署目录和仓内同时保留两份可编辑真源，运行时偷偷写 remote SysForm |

生产静态站点没有浏览器写源码仓库的能力，这是部署形态，不应用一份只读 JSON 模糊掉设计保存需求。完整合仓验收必须包括开发工作区中由现有设计器编辑、DataSet 保存、仓内文件 diff、关闭重开、刷新/重新构建后仍生效。生产的系统定义维护应走同一工作区版本发布，不新增浏览器在正式站点任意写仓的后门；动态业务配置的正式远端编辑仍保留。

正式源码 API 变更前，需把上述 development writer 的最小 typed read/write/verify 合同及能力注入位置写清；目前只是方案，不把拟议 Vite adapter 当已存在功能。PageRuntime、ScenarioDefinitionResource 和文件 owner 继续共用，不为本地/远端各实现一套编辑/取消/保存逻辑。

## 6. 对上一配置驱动方案的必要调整

1. 原报告“首次 IO 前已有 DataView、三类身份分离、严格完整键、modelScope、缺配置拒绝、真实回执、取消释放”等结论保留。
2. **撤回以“把系统应用全部配置正式写入远端 D99/SysForm，再改 host 读取”作为完整目标的隐含前提。** 该方案仅能完成 API 化，不能满足本次明确的系统应用整体合仓。
3. 暂停原先为 7AB 新视图的线上写入计划，先确定该资源的仓内唯一真源和写入 adapter。新 default/applicationCatalog/navigationRoot 仍需按真实合同建立，但应保存到最终选定的唯一来源；不先写一份远端再复制仓内形成两套活动配置。
4. auth-only 远端文件读取不再是 builtin 系统配置启动的必备门槛；它仍是 dynamic 配置跨来源读取的独立验证项。正式 DB 元模型的认证读取与权限消费仍需要验证，不能因为系统配置已在仓而跳过。
5. 当前新增 RED 可保留为原读取旁路的证据，实施前调整最终输入/预期来源。不能为了让旧 RED 变绿而先完成已被纠正的远端唯一路径。
6. 系统应用合仓应覆盖导航入口→场景资源→模型查询→编辑保存→下游消费→工程发布，不能把首个只读目录或一个本地导航入口当交付。

## 7. 分片建议与验收

| 顺序 | 可审查输出 | 必需验证/边界 |
| --- | --- | --- |
| A. 先迁入已核定义并编译 | 按上方最窄清单将现有系统配置变为生效源，移除对应 remote 入口，复用页面/壳；完整来源清单随切片补齐 | 编译和真实入口首先暴露缺口并迭代；不再以全量调查挡住开工，不删除正式 DB 数据 |
| B. 仓内资源读取/来源公共合同 | 原资源层支持 repository 来源；本仓系统应用声明进入 config/注册表；writer 缺口登记并接续补齐 | RED 覆盖缺源/错 ID、同一资源双来源、来源变化、旧查询；确认配置首读走 DataView，不等待所有保存能力才迁入 |
| C. 壳与启动切换 | 复用首页/现 app store、DynamicRouter、SystemPageIdentity，系统导航来自仓内声明；动态应用保持既有远端链 | 阻断系统远端蓝图/场景定义读取，仓内系统导航/配置仍能加载；后端 DB/Auth 故障独立显示，不伪造数据。URL 原路径、刷新/深链、节点唯一性、回退/快速切换和 dirty guard 正确 |
| D. 保存闭环及系统功能接入 | 补开发态 repository adapter 的 read/write/verify，复用定义视图保存；目录/根→数据空间目录与设计→数据库/资源专题→DevSystem；移除 host builder 和当前应用=文件源假设 | 每片 fullkey、正式 DB 身份/权限、取消/保存/重开、并发冲突/未知回执/未加载记录保留和下游消费；生产包无开发 writer；跨源分别确认 |
| E. 整体合仓交付 | 现有设计器改仓内系统视图排序/页大小，真实保存至 Git 工作区、关闭/重开、SPA 刷新、构建与部署读回；第二页复用 | 无 host 改码即可生效；缺 repo 配置明确失败且零 remote fallback；动态业务项目仍按其原正式来源正常工作；只删除被替代调用，不删除后端应用/业务数据 |

每片执行原有效 RED、定向单测、typecheck/lint、正式生成、规则/build、主控/独立审查和真实 SPA；既有失败基线继续独立登记。最终新增“应用定义来源”验收：记录每个系统页面使用的 app/navigation/page/scenario/source revision；同时证明所有业务查询/写入仍走 SPARK data 和既有授权。

回滚按资源来源边界执行：仓内配置与代码可回退已确认版本，但不得通过恢复远端 fallback 混用两份定义；未完成来源切换的资源仍明确留在原路径，不谎称已合仓。源迁移前像保留为证据，不自动删除/重挂后端应用、模型、字段、关系或 pagedata。保存未知先核验，不盲目回滚覆盖其它编辑。

## 8. 需要首片核清、不能假定已经解决的事项

- **真实应用身份与导航根**：保留 D99 是否是当前相关后端操作的必要身份，或仅沿用了远端程序入口；现 selection API 保存 root 的用途需逐项核对。可保留真实 ID，但启动定义要明确来自仓内。
- **系统导航全量来源**：当前页面注册无场景绑定，只有四份仓内场景；必须从正式记录/现有页面语义补齐系统导航层级、节点 ID、调用参数、场景身份，不凭页面名称猜 ID。不新增前端角色或复制授权表。
- **仓内与正式配置差分**：7AB 本地三表/远端四表是已证差异；其它配置要核实际内容、模型引用、legacy 关系和运行依赖，不能直接复制文件覆盖。合仓后的本次读写指向同一版本/来源。
- **开发态写宿主**：当前未发现已可用能力；按第 5 节补窄 adapter 是建议，不是“后端缺全局 owner”的阻塞。具体发布/文件版本接线由实施片确定，保留真实回执。
- **远端数据操作 scope**：目录认证查询已有成功证据，不能外推所有注册/保存都支持 auth-only；逐 API 保留真实所需执行身份和登录权限，不能统一去头或按用户名放行。
- **生产维护方式**：本仓系统定义经工作区保存/工程发布；生产动态业务配置仍远端。若要求生产站点直接修改 Git 源，应另给已确认宿主能力，不能把“纯 SPA + 无仓写能力”当可直接写盘事实。

本文建议的纠正方向是应用定义与维护发布链真正入仓；服务器仍承载正式业务元数据和数据服务。这两件事可以同时成立，不能再用源码位于本仓或 URL 字样单独代替验收。
