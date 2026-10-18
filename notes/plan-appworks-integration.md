状态：draft

## 任务目标
把参考仓 appworks 的全部业务页面完整整合进本仓（唯一系统），按本仓语义收敛：原路径承接、业务语义完整、数据统一走 SPARK data（DataSet/DataTable/DataView）与标准组件。

## 源头（2026-10-19 核定，待用户确认）
- 参考仓 `E:\r\sparkproject` master `packages/ui/domain/metadata/src`（HEAD 09937a5d6，304 文件）为当前源头；它是 `1010@58c1e2605:apps/appworks/src/ui`（238 文件）的后继，同路径 223 个。
- 仅存在于 1010 的约 15 个文件（views/appworks/*、app/design-target.ts、app/navigation-host.ts、AppWorksAiAssistant.vue、application-function-management 4、structured-config 2、session、tenant-governance、database-management 1）逐个判定：被 master 取代则不迁，仍有独立语义则并入。
- 参考仓只读对照，不入构建；实施、测试、构建只在 D:\SPARK_AppWorks。

## 覆盖现状
- 参考业务 Vue 102；本仓同路径 9（data-set-management 4/5、api-management 3/3、structured-config 2/18）。
- 已承接但路径不符（违反 AGENTS 0.2，需回到原路径或删除包装）：DBMS.vue→database-management 3 个入口、CacheManager.vue→cache-management、AppList.vue→application-manager。
- 数据空间部分续用 [data-space-retirement-ledger.md](data-space-retirement-ledger.md)，本计划只引用其验收矩阵，不重复记录。

## 收敛规则（每页统一流程）
1. 语义梳理：参考页 + 其 data/api 调用链 → 输入/输出/模型/字段/操作/取消/异常/下游。
2. 数据空间合同：落到该页场景的模型绑定与命名 DataView；参考直连接口改为数据层资源适配，不进业务层。
3. 页面：原相对路径落 `src/views/`，标准组件 + dataViewKey 绑定；缺能力先补标准组件。
4. 删除：被替代的包装页、vue-pages 换路径条目、页面私有数据逻辑同步删除。
5. 验收：实页真实查询/保存/重开/下游消费；服务边界如实登记并在 UI 明确提示。
- 不迁：参考仓角色/权限判断（AGENTS 0.3）；权限专题暂缓。

## 阶段
- 阶段 0 基线：完成数据空间台账当前项（数组表头）；工作区分组提交；建立本计划的整页验收矩阵（每页一行：语义/合同/页面/删除/实页）。
- 阶段 1 样板收口：数据空间管理（列表 + 设计器对话框入口 + `:field-ids` 改视图绑定 + 删 `/data-space-design`）完整通过，作为后续页面样板。
- 阶段 2 data-platform 其余：database-management 6（替换 DBMS.vue 包装）、structured-config 16、semi-structured 10。
- 阶段 3 application 24、governance 6（不含角色判断）、integration/report 5。
- 阶段 4 organization 10、system 6、workflow 11。
- 每阶段：成组修改 → 影响面回归 → 阶段末实页整组验收；整页全部完成后一次全量回归。

## 影响范围（按阶段展开时逐页列文件）
- `src/views/features/**`（新增/迁入）、`config/navigation/vue-pages.json`（原路径条目、删换路径条目）、对应场景 pagedata、`packages/spark-component`（仅确有缺口时）、`packages/spark-lowcode-api` 资源适配（替代参考直连接口）、`tests/**`。

## 兼容性
- 删除换路径包装会改变现有入口文件位置；蓝图导航 URL 不变。
- 不改 Java/后端；服务不支持的能力登记为边界并在 UI 拒绝/提示。

## 验证计划
- `pnpm run typecheck`、受影响路径 lint、定向 vitest；阶段末影响面回归；公开声明变化才刷新 ClassModel；阶段末生产构建与实页验收。

## 风险项
- 规模大（93 页）：严格按阶段与样板推进，避免逐补丁结题。
- 工作区未提交改动 270 文件：阶段 0 先建基线。
- 参考仓仍在演进（HEAD 漂移）：每阶段开工记录参考 HEAD 与对照文件哈希。

## 待用户决定
- 源头是否以 master metadata 为准（1010 独有文件逐个判定）。
- 工作区基线提交方式。
- 阶段顺序是否按上文。
