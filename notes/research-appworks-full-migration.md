# 参考仓 appworks 全量迁回 + 数据空间完整整合：研读锚点（2026-10-17）

状态：archived。2026-10-18用户已撤回旧方案。本文件仅保留当时的来源调查，不授权全量迁移、复制项目或继续旧执行顺序；当前唯一工作仓是D:\SPARK_AppWorks，执行事实见[删除记录](data-space-retirement-ledger.md)。

## 源头

- 参考仓：`E:\r\sparkproject`（origin `http://8.148.73.250:9909/wangt/sparkproject.git`）。
- `apps/appworks` **不在 master**；在分支 `1010`（及 `codex/correct-single-web-20260917`），最后提交 `58c1e2605`（2026-10-05「feat: move formal data-space reads into root API」）。
- 规模：472 文件 = `src/ui` 238、`src/data` 75（`data/api` 68）、`src/runtime` 2、`tests` 153、配置 3。
- master 上同类页面另有 `packages/ui/domain/metadata/src`（304 文件），与 `1010:apps/appworks` 不是同一份，**不作为本次源头**（待用户确认）。

## 覆盖对照（按 AGENTS 0.2：参考 `src/ui/` 相对路径 = 本仓 `src/views/` 相对路径）

- 参考业务 Vue：93；本仓同路径已有：9；缺失：84。本仓 `src/views/features` 共 27 个 Vue（含本仓补充子组件）。
- 已有同路径：data-set-design-page / edge-panel / node-panel、data-set-list-page、data-dictionary-list-page、dictionary-setting、api-config-page、api-interface-list-page、api-management-page。
- 缺失分组（文件数）：
  - application：context 1、function-management 4、application-manager 5、data-menu 3、enterprise-app-auth 7、enterprise-regist 6
  - data-platform：data-set-management 1（data-set-auth-page）、database-management 6、semi-structured 7、structured-config 17
  - governance：desensitization 1、navigation-permission 1、role-management 3、user-app-authorization 1
  - integration：report 5
  - organization：job 1、structure 1、tenant 1、user 1
  - system：bug 1、cache 1、data-recovery 1、flow-monitor 1
  - workflow：append-user 1、flow-model 4、flow-runtime 3

## 与本仓约束的交点（AGENTS 0.2—0.7）

- 迁移 ≠ 拷贝运行：业务页须按本仓标准组件 + SPARK data（DataSet/DataTable/DataView）重做；`src/data/api` 68 个直连接口不能原样搬进业务层（0.4“业务页面必须走 spark-data API”）。
- 目录/文件名原样承接；蓝图导航 URL 不改。
- 权限专题当前暂缓（0.3）；参考仓 role-management 等角色实现不构成迁移要求。
- 数据空间：本仓 DataSet→DataTable→columns/views 归属、pagedata+DB 双持久化、两类关系（0.5）。参考仓只用模型层。
- 交付单位是完整页面业务闭环（0.7），先样板后推广。

旧链路重启与设计器入口草案已删除，不再从本研读派生实施任务。以上数量、路径及来源判断仅属于2026-10-17调查范围，未在本次重新验证。
