# SmartBid 当前代码研读

## 基线

- 工作路径：`D:/SPARK_AppWorks`
- 当前基线：`main` / `bffc372e0`
- 研读结束时工作树干净，无额外 worktree。
- SmartBid 当前目标应用为 `D8490EC99436A8B9AFDE205BE3153802`；旧应用 `84A0E416D20FCB87F1CB48159F4173E1` 不作为本次实现对象。

## 产品与文档真源

- 总体入口：`docs/smart-bid/layered-delivery-plan.md`
- 19 页及 C1 函数合同：`docs/smart-bid/delivery/pages-scenarios.md`
- C0-C8 顺序和验收：`docs/smart-bid/delivery/delivery-acceptance.md`
- 动态实施事实和实服边界：`notes/data-space-retirement-ledger.md`
- 文档已删除旧逐页“待建矩阵”，源码现为 16 个 SmartBid 业务四文件页、3 个平台承载页、47 个模型和 61 个动作。

## 当前运行架构

- 业务页面由 `rule.json/style.css/可为空 script.js + 共享 pagedata` 承载。
- `PageTool`、发布、文件历史、PageRuntimePool 和 lowcode-runtime 共同采用正式的 rule/script/style 三文件集合。
- SmartBid 16 个空 `script.js` 是当前“默认空脚本”形态，不是可直接删除的过时文件。
- 页面动作统一由标准声明式 action 执行；host-command、discard-changes、route/row/JSON/prompt 输入和结果投影位于 `packages/spark-component/src/page/actions/`。
- 数据、权限、草稿、保存和 unknown 恢复继续经 PageRuntime -> DataSet -> DataView；页面不能另建 HTTP、权限或保存通道。

## 当前烟测

- 当前 HEAD 最小 SmartBid smoke 为 4 个文件、33/33，通过，退出码 0：
  - `tests/app/services/smart-bid/content-authoring-host.test.ts`
  - `tests/app/services/smart-bid/operation/readers/content-operation-guide-reader.test.ts`
  - `tests/app/services/smart-bid/content/workspace/content-page11-config.test.ts`
  - `tests/app/services/smart-bid/content/workspace/content-page11-renderer.test.ts`
- 早先 `smartbid-test-results.json` 的 839/847 与 8 失败不是当前状态。
- 该 smoke 不证明 C1 正式服务、权限、写回或冷重开业务闭环。

## C1 当前事实

### 页01 企业服务

- 可复用 `5914FF981A7DF228ED88BBDB71353470`：
  - `Base_Enterprise_Info`
  - `EnterpriseInitializationRequest`
  - `initializationReadback`
- `src/views/features/application/enterprise-regist-manager/` 已有企业列表、审核、授权、密码和配置 UI。
- 缺口仍是服务决定版本、停用/恢复、退出交接、当前权限和服务回执的统一业务合同。
- 入驻初始化不能被当作企业服务生命周期已完成。

### 页02 公共能力发布

- 现有应用授权申请使用 `Base_AppSystemList@published`，审批写 `enterprise_app_auth`，均经正式 DataView。
- `src/services/project/page-tool-publication.ts` 已提供文件快照、manifest、指针和 unknown 恢复。
- 当前缺口是来源方分发许可、公共能力版本、目标企业有效范围、调整/撤下事件及原发布查询作为同一业务合同。
- 应用授权或工具文件发布都不能直接等同公共能力分发。

### 页03 服务与未决办理

- 现有数据恢复页面可验证原记录选择、恢复记录、unknown 核验和明确失败丢弃。
- 现有 SmartBid、PDF、发布等 owner 能分别核本次原请求或 unknown。
- 当前缺口是统一运行中断登记、受影响队列、跨经办移交、当前授权读取和原操作查询的正式入口。
- 不得用“查询一个业务 owner”替代页03 的统一编排与接手。
- 授权 SPA 对 D849 当前蓝图只读核定三个正式平台运营节点：
  - 租户生命周期 `E09340CD2AC684C7A71D9EFFE62BEFAF`
  - 公共能力发布 `DB6C825F05A702239399686005521F1A`
  - 服务运行与恢复 `27D2DA31B2848E8A17C1214AA330E11D`
- 三节点均无导航地址、导航宿主、主数据空间及页面工具；租户生命周期的阶段、负责人和功能编码为空。因此当前菜单只可见“应用设计/项目执行”，平台运营节点不是可运行的 C1 页面。

## 调用链与影响面

- 页01：平台路由 -> `enterprise-regist-manager-page.vue` -> `useFeaturePageRuntime` -> 场景 5914 -> DataSet/DataView/命令资源。
- 页02：发布源/已发布目录 -> 原 DataView -> 文件或授权 owner -> 原 publication/审批记录 -> 指针/回读。
- 页03：各业务 owner 的原请求/unknown -> 恢复查询 -> 当前权限 -> 移交/继续查询；目前只有各责任域局部实现，没有统一 C1 owner。

## 已识别约束

- 不修改或启动 Java。
- 不复制旧 84A 应用或旧页面。
- 无正式服务合同时不得制造模型、字段、HTTP 端点、权限或角色。
- 只允许已证实来源接入 PageRuntime -> DataSet -> DataView。
- 真实隔离写入必须精确回读和精确清理；unknown 不重发。
- 三文件公共合同在本计划中不改变；只有 rule/page action 真实缺口可触发另一次范围确认。

## 本轮方案结论

- 本轮不删除 16 个空 `script.js`，不修改 PageTool 固定三文件合同。
- 本轮先将 C1 从“平台邻接可复用”重梳为逐页、逐函数、逐 owner 的正式缺口清单。
- 用户确认方向纠正为“页面已建，只缺导航”。本轮不新建 C1 页面或数据空间。
- 三个现有原生页均通过 `vue-pages.json` 正式注册，并已能按系统导航冷打开：
  - 入驻管理：`/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page`，数据空间 `5914FF981A7DF228ED88BBDB71353470`
  - 申请列表：`/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page`，数据空间 `C06D41607B6258106F35A0A319B71804`
  - 数据恢复：`/features/system/data-recovery/ui/data-recovery-page`，数据空间 `70D5D8FACCC201A822F64B16A441BE8F`
- 已接通系统页通过 `vue:<registered path>` 建立目标，蓝图叶节点无需绑定页面三文件或复制共享 pagedata；页面自身仍消费注册表中的正式场景。
- `项目执行`模块的导航样板为：模块 `NavigationUrl` 空、`IsShowAtNav=1`、`IsShowChildItem=1`、子项位置 `Left`。叶页面应具有 `vue:` 地址并显示到导航。

