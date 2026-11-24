状态：draft

# SPARK 五层治理与应用交付：详细实施计划

## 任务目标

在不建立前端角色、不按用户名或企业名判权的前提下，完成：

1. 平台应用管理委派的强制初始绑定与后续治理。
2. 平台应用使用授权的申请、直授、审批、模块和终态。
3. 每家企业必须拥有的内部管理能力。
4. 企业受托管理平台应用时的独立管理分区。
5. 企业跨应用数据共享与维度治理。
6. 复用现有应用蓝图、PageTool 和 PageRuntime 的应用/页面交付。

最终权限对象始终是当前登录人的本次入口、行、字段、动作与提交结果。

## 架构收敛前置：清退 spark-lowcode-api 独立项目

五层治理实施统一通过 SPARK Data，不保留 `spark-lowcode-api` 作为并行业务数据 API。该收敛是总计划基础设施阶段，详见 [研读](research-spark-lowcode-api-retirement.md) 与 [唯一实施台账](data-space-retirement-ledger.md)。

### 语义归属

- SPARK Data：DataTable owner adapter、DataView query/save/runtime、权限基线与保存回执。
- spark-project-model：蓝图领域、文件/版本与场景生命周期。
- spark-ai：Agent turn/config/data-entry。
- spark-utils：仅通用 HTTP、wire/error/event 原语。
- src/platform-adapters：平台会话、应用目录、权限设计、上传及特定服务 adapter。
- backend-api-contracts：wire、endpoint 与 parity 合同。

### 总计划门槛

- 五层治理新页面、入口与业务服务不得直接 import 已定为退役的 `LowcodeApi` 聚合门面。
- 新查询/保存只经 PageRuntime → DataSet → DataTable → DataView。
- 新宿主 adapter 只负责 scope、wire 和 owner 装配，不向页面暴露第二套 CRUD。
- `spark-lowcode-api` 的既有能力按域迁移并验证后删除，不在治理页面中复制旧门面。

## 阶段与业务语义

### G0：部署初始委派

- **业务输入**：部署 ID、平台应用正式 ID 清单、领码科技正式租户 ID。
- **业务输出**：每个平台应用指向领码科技的初始管理委派记录及独立回读。
- **约束**：由部署/服务责任方执行；前端登录、页面打开或空查询不得自动补写。
- **异常**：重复执行不覆盖；已有不同委派、已解除、身份不唯一、结果未知均停止。
- **下游**：平台管理工作清单。
- **非目标**：不创建应用使用权、模块、默认应用、所有权、发布者或数据共享。

同时完成退役阶段前置：冻结 `spark-lowcode-api` 公共面增长，生成完整 consumer/import 清单；不要求 G0 等待整个包删除。

### A：跨企业应用申请拒绝闭环

- 企业 A 申请企业 B 已发布应用。
- B 以独立登录会话按正式请求键读取并拒绝。
- A 独立重开，按同一请求键读到 `REJECTED` 和拒绝原因。
- `saveChanges().success === false` 不得提示成功。
- 结果未知只核验原提交，不重复业务写入。

此阶段可复用现有 lowcode 适配，但所有新增查询/保存须落到 DataTable/DataView owner；只修复返回 `success:false`、请求键回读和 adapter 绑定，不扩张旧 API。

### B：平台与企业正式入口

- 平台工作区展示“管理委派”“应用使用授权”两个独立域。
- 每家企业工作区展示“企业内部事务”。
- 只有当前登录人获准的受托应用才显示“受托平台应用”域。
- 两域共用壳但使用独立查询、执行域、DataView、提交和回读。

### C：应用使用终态

- 直授、申请审批、初始化、模块授权、撤销、重新授权分别核实。
- `INITIALIZING`、待审消失、HTTP 成功均不证明应用已可使用。
- 最终以租户目录、当前登录人业务导航和正式数据查询回读。

### D：管理委派管理页

- G0 已完成初始委派后，才建立/转移/解除管理关系页面。
- 页面操作不改变应用使用、所有权、模块、共享或个人权限。
- 原/新受托方和当前登录人分别回读。

### E：跨应用只读共享

- 一个生产应用 → 一个消费应用 → 一个受限只读 DataView。
- 服务端控制资源、视图、行、字段和操作范围。
- 消费应用只保存引用，不复制数据或切换为生产应用头。
- 撤销验证已打开实例的下一次访问和全新实例。

### F：维度与应用/页面交付

- 保留 88A4、07D2、绑定 ID、规则和台账。
- 维度归属明确后才迁移；引用不可判定时不删除、不重挂。
- 复用蓝图、PageTool、ScenarioViewConfig、PageRuntime。
- 页面级是应用设计子域，不新增第六类权限。

### R：低代码包退役收口

- 完成 wire/领域/host/AI 能力按语义迁移。
- 更新 import、alias、workspace、lockfile、consumer ledger 与 ClassModel。
- 删除 `packages/spark-lowcode-api/` 后做全仓回归。
- 此阶段不改变五层业务语义，只消除独立聚合项目和并行入口。

## 影响范围与目录规划

### 保持原目录与 URL

以下页面不得搬迁：

- `src/views/features/application/enterprise-regist-manager/`
- `src/views/features/application/enterprise-app-auth-application/`
- `src/views/features/application/application-manager/`
- `src/views/features/application/application-function-management/`
- `src/views/features/data-platform/data-set-management/`
- `src/views/features/data-platform/structured-config/dimension-definition/`
- `src/views/app/AppList.vue`

对应 URL、`dataSpaceId`、`identityHost`、导航 ID 保持原值。

### 条件新增目录

只有正式合同成立时才创建：

```text
src/platform-adapters/resources/system/
  governance-entry/
    catalog-entry-resource.ts

src/views/features/governance/
  delegated-platform-apps/
    ui/
      delegated-platform-apps-page.vue
  platform-app-delegation/
    ui/
      platform-app-delegation-page.vue
  application-data-sharing/
    ui/
      application-data-sharing-page.vue

config/pages/governance/
  delegated-platform-apps/
    pagedata.json
  platform-app-delegation/
    pagedata.json
  application-data-sharing/
    pagedata.json

tests/runtime/application/
  platform-app-delegation/
    platform-app-delegation.test.ts
  application-data-sharing/
    application-data-sharing.test.ts
  dimension/
    dimension-ownership-migration.test.ts
```

目录规则：

- 新页面只承载有独立真源的新能力。
- 不创建 `admin`、`five-layer`、统一权限表或第二套保存入口。
- 受托平台应用清单不是平台全量列表，也不是委派编辑器。
- 跨应用共享页面不持有生产业务行副本。
- 配置页使用正式标准组件和 DataView；文件 owner 只在数据层适配内部。

## 技术方案

### G0：部署合同与初始化

**确认前不写生产代码。**

1. 明确平台应用正式 ID 清单及完整性依据。
2. 明确领码科技正式租户 ID，不按中文名、简称或 `IsSys` 判定。
3. 明确管理委派模型、关系主键、初始化记录、保存和回读合同。
4. 部署方逐项保存并回读，得到可追溯脱敏证据。
5. 重跑同部署不得重复新增、覆盖或复活关系。
6. G0 未全部确认时停止 B-D 的上线实施；允许继续核对已有申请链的无写入问题。

### A：申请授权闭环文件改动

| 文件 | 修改内容 |
|---|---|
| `src/views/features/application/enterprise-app-auth-application/model/enterprise-app-auth-application-model.ts` | `commitAppAuthRecord()` 检查保存 `success`、目标视图与正式回执；区分明确失败、已确认、unknown、已确认但回读失败 |
| `apply-app-auth-content.vue` | 0221 只新增目标行；提交后取得正式请求键；不得以空 0221 刷新证明成功 |
| `enterprise-app-auth-application-audit-dialog.vue` | 提交前重核正式请求键、业务条件、当前登录人和实际修改字段权限；不得回填不可读拒因 |
| `enterprise-app-auth-application-page.vue` | 分离关闭和已决定；决定事件携带正式键并等待宿主结果刷新 |
| `my-app-auth-request-page.vue` | 按正式请求键精确回读；区分放弃草稿、取消已提交申请和重新申请 |
| `config/pages/application/enterprise-app-auth/{apply,my-requests,review}/pagedata.json` | 只在正式合同需要时增加精确按键视图；保留常驻范围 |
| `tests/runtime/application/enterprise-app-auth/enterprise-app-auth.fixture.ts` | 区分三场景模型、用户/租户和权限响应，不再把共享内存表当跨场景证明 |
| `enterprise-app-auth-pages.test.ts` | 增加 `success:false`、回读失败、个人权限、明确/unknown 保存 |
| 拟新增 `enterprise-app-auth-roundtrip.test.ts` | 双会话、双申请干扰、并发决定、按键重开和不同人权限 |

**A 阶段硬门槛**：

- 0221、47DA、C06D 的正式请求键关系必须由服务合同确认。
- 三个 modelId 不得被名称碰撞或测试夹具冒充成线上映射。
- B 的条件提交必须由服务端保证同请求最多一个有效决定。
- `C06D audit` 提交前必须验证 `PENDING/REQUEST/source_ent` 与当前人权限。
- 本阶段新增能力必须通过 SPARK Data DataTable/DataView；不得新增 `LowcodeApi` 或页面直接平台 API 调用。

### B：入口与企业工作区

| 文件 | 修改内容 |
|---|---|
| `src/platform-adapters/lowcode-runtime.ts` | 区分目录域入口和真实应用导航；目录域不得注入 `X-AppId` |
| `src/platform-adapters/system-navigation.ts` | 本地登记作为候选；正式入口结果决定分区、目标和落点 |
| `src/main.ts` | 不再仅以登录态启用平台菜单；同一正式结果安装入口、路由和首次装配 |
| `src/App.vue` | 平台/企业命令使用正式落点并复核执行域 |
| `src/layout/AppHeader.vue` | 菜单显示与实际获准命令一致，不提供本地隐式放行 |
| `src/services/project/navigation/project-navigation-guard.ts` | 统一直链、切域、过期结果和隐藏伴随页处理 |
| `src/services/project/enterprise-landing.ts` | 默认应用仍须当前个人可见，不能当作权限证明 |
| `packages/spark-app/src/router/dynamic.ts` | 仅在现有宿主不足时隔离分区失败和旧 owner；不复用失败前的授权树 |
| `config/navigation/vue-pages.json` | 只登记确有正式入口/场景的新叶页 |
| `config/pages/system-scenarios.json`、`src/registries/system-scenario-registry.ts` | 仅同步正式新增场景登记 |
| 拟新增 `governance-workspace-entry.test.ts` | 同一入口结果串测 header、菜单、landing、守卫、伴随页和首屏 |

验收四组入口：仅内部、仅受托、两者、两者皆无；再测领码成员无个人权限、受托应用未覆盖对象。

### C：应用使用授权终态

| 文件 | 修改内容 |
|---|---|
| `enterprise-regist-manager/ui/enterprise-app-auth-dialog.vue` | 直授/撤销/模块操作检查保存结果，精确回读目标记录，分别呈现关系已保存和下游已生效 |
| `enterprise-audit-dialog.vue` | 企业初始化命令检查 `success`，区分已接收、unknown、回读入驻 |
| `enterprise-regist-manager-page.vue` | 仅在宿主刷新/状态展示需要时修改 |
| `config/pages/application/enterprise-regist-manager/pagedata.json` | 仅在正式合同支持时补有效授权/模块回读视图 |
| 拟新增 `enterprise-app-use-authorization.test.ts` | 直授、初始化、撤销、重授、模块残留和同租户不同人 |

应用使用授权不推导管理委派；管理委派也不推导应用使用权。

### D：平台委派唯一维护入口

条件新增：

- `config/pages/governance/platform-app-delegation/pagedata.json`
- `src/views/features/governance/platform-app-delegation/ui/platform-app-delegation-page.vue`
- `tests/runtime/application/platform-app-delegation/platform-app-delegation.test.ts`

功能：

- 读取平台应用和当前人获准的委派对象。
- 建立、转移、解除经同一 DataSet 提交。
- 精确关系键回读，不以删除/新增伪装原子转移。
- 原/新受托方各自重开验证。
- 不能通过页面修改 `EntId`、负责人、发布者、默认应用实现委派。

### R：低代码包退役收口

影响面按退役计划执行，不为五层页面另建迁移层：

- `packages/spark-data/src/**`
- `packages/spark-project-model/src/**`
- `packages/spark-ai/src/**`
- `src/platform-adapters/**`
- `backend-api-contracts/**`
- `package.json`、`pnpm-lock.yaml`、TS/Vite/Vitest/ESLint 配置
- `generated/dts-class-model/**`

验收要求：

- `SPARK Data` 是唯一业务 query/save owner。
- 页面与组件无独立 lowcode 数据 API。
- `spark-lowcode-api` 包名、alias、依赖与公开导入归零。
- wire parity、consumer ledger、ClassModel 与全仓测试全部重建。

### E：跨应用数据共享

条件新增：

- `config/pages/governance/application-data-sharing/pagedata.json`
- `src/views/features/governance/application-data-sharing/ui/application-data-sharing-page.vue`
- `tests/runtime/application/application-data-sharing/application-data-sharing.test.ts`

条件修改：

- `use-application-function-data-space.ts`：只把正式获准共享引用作为候选。
- `lowcode-data-space-runtime.ts`：仅在现有装配不足时按正式共享合同装配。

不得修改 `90A8` 目录语义来代替共享授权。

### F：维度归属迁移与应用/页面回归

条件修改：

- `config/pages/structured-config/dimension-design/pagedata.json`
- `dimension-design-page.vue`
- `use-application-function-dimension-source.ts`

复用不改：

- `binding-editor.ts`
- `ledger-guard.ts`
- `dimension-ledger/pagedata.json`
- 蓝图、PageTool、PageRuntime、发布 proof 相关公共链。

验收：

- 旧 ID 与归属/版本清单逐项可核。
- 同名不同归属不合并。
- 不可判定引用自动删除/重挂次数为 0。

## 兼容性

### 必须保持

- 原 URL、`PageScope`、场景 ID、导航身份和 `identityHost`。
- 5914 企业初始化命令及部分成功/unknown 语义。
- 0221/47DA/C06D 三申请场景及独立伴随页。
- 0C70 主表、负责人、数据库、导航根的分阶段保存。
- 企业默认应用不是应用使用授权。
- 90A8 目录不是共享权限。
- 88A4/07D2 数据、来源绑定和台账。

### 切换顺序

```text
正式只读接通
  -> 原键与旧消费者比对
  -> 切换唯一写入口
  -> 独立重开与下游核对
  -> 删除被替代路径
```

只做影子只读比对，不双写。失败时停止新写入，不退回“登录即获准”。

## 验证计划

### 编译基线

```powershell
git --no-optional-locks status --short --branch
pnpm run typecheck
```

实施前必须先记录基线。若工作树中的现有改动与目标文件冲突，停止并重新拆分方案。

### A 阶段

```powershell
pnpm exec vitest run tests\runtime\application\enterprise-app-auth
```

### B/C/D 阶段

```powershell
pnpm exec vitest run tests\runtime\auth-nav\navigation
pnpm exec vitest run tests\ui\component\app-header-standard.test.ts
pnpm exec vitest run tests\app\config\vue-page-registry.test.ts
pnpm exec vitest run tests\app\services\project\enterprise-landing.test.ts
pnpm exec vitest run tests\runtime\application\application-manager
pnpm exec vitest run tests\runtime\application\enterprise-regist-manager
pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src\platform\resources\system\tests\enterprise-initialization.test.ts
```

### E/F 阶段

```powershell
pnpm exec vitest run tests\runtime\application\application-data-sharing
pnpm exec vitest run tests\runtime\application\dimension
pnpm exec vitest run tests\runtime\auth-nav\data-space
pnpm exec vitest run packages\spark-project-model\tests\page-runtime.test.ts
pnpm exec vitest run tests\runtime\page\runtime\page-runtime-tabs.test.ts
pnpm exec vitest run tests\app\services\project\page-tool-publication.test.ts
```

### 阶段交付

```powershell
pnpm run typecheck
pnpm run lint
pnpm run verify:pages-config
pnpm run verify:ai-codegen
pnpm run verify:rules
pnpm run test:run
```

公共包声明变化时，还需运行受影响包的 typecheck/test，并正式生成 ClassModel；不得手改 `generated`。

## 深度审核结论

### 通过项

- 五层可由现有应用、页面和数据链承接，不需要五级角色树。
- 管理委派、应用使用授权、数据共享授权保持独立。
- 企业内部管理与受托平台管理可共用工作区，不共享权限结果。
- 平台应用强制初始委派领码科技与“最终权限落实到个人”可同时成立。
- 现有申请链适合作为首个完整业务切片。

### 必须修复的现存风险

1. `commitAppAuthRecord()` 未检查 `saveChanges().success`。
2. 三申请场景 modelId 不同，测试夹具的共享物理表不能证明线上映射。
3. 平台系统菜单当前由登录态与本地登记驱动，缺个人授权合同。
4. 目录发现不等于共享数据权限。
5. 入口、发布 proof 和目录可见不授予数据读写。

### 当前阻塞

1. G0 平台应用清单、领码稳定租户 ID、委派模型与初始化回读合同。
2. 0221/47DA/C06D 正式请求键映射及并发合同。
3. 无应用目录域的当前登录人入口合同。
4. 跨应用共享的资源粒度、运行权限和撤销时限。
5. 维度归属与迁移清单。

## 必须停止实施的情形

1. G0 未逐应用回读。
2. 需要用角色、企业名、简称、`IsSys`、负责人或默认应用推导权限。
3. 同名模型或测试夹具被当成正式线上映射。
4. 无正式请求键、精确回读或条件提交。
5. 只能靠登录态、成员身份或前端过滤平台全量对象。
6. `success:false`、查询失败或无权被显示为成功/空结果。
7. unknown 只能靠重复写入恢复。
8. 共享、维度或同一关系出现第二写入口。
9. 实施必须覆盖当前未提交的无关底座改动。
10. 五层治理新增入口时直接依赖 `spark-lowcode-api` 公共聚合 API。
11. 删除包前仍存在页面级/宿主级第二 query/save 实现。

## 风险项

- 本仓是纯前端，不能修改或启动 Java 补合同。
- 平台委派、使用授权、共享、维度可能分别有不同来源和保存时序。
- 现有 dirty worktree 使直接编码回滚风险较高。
- 服务合同缺失时必须登记阻塞，不允许伪造模型 ID、接口、权限或跨来源事务。

## 完成标准

一笔真实操作必须回答：

1. 谁在什么租户/应用执行域。
2. 使用哪次当前登录人的正式查询。
3. 只修改了哪个关系或记录。
4. 正式回执确认了什么。
5. 独立重开后谁消费了结果。
6. 失败或 unknown 时为什么不会重复写入。

计划的下一状态只能在用户审核批准后从 `draft` 改为 `approved`。

