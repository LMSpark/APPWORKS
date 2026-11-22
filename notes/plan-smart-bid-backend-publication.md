状态：implementing

## 阻断原因

Page04 与 Page05 已完整发布；Page06 也已完成 manifest、VersionId 与读回。当前阻断是动态路由晚注册：直接进入已发布 `__page` 时，导航返回后才 `addRoute`，当前 route 保留初始空匹配，Page04/Page06 均不挂载 PageRenderer。按统一宿主修复，不重发 PageTool 文件或重建目录。

## 任务目标

一次完成 D849 仓内 16 套 SmartBid 页面（Page04-Page19）的正式三文件上传、快照、manifest、蓝图绑定及当前 SPA 导航打开；租户页01由 JWT 承接，平台页02/03无 SmartBid JSON，本轮不伪造。

## 阶段与业务语义

- 业务输入为仓内 16 套 `rule.json/script.js/style.css`，正式输出为各 pageId 的三文件工作版、不可变快照、manifest、蓝图 `VersionId` 与可运行导航。
- 每页共享正式 D849 数据空间 `D3BBA1F0780056C837AC35E9825CAD5A`；没有主场景的节点先绑定该场景后才发布。
- 页11/12、13/14 需要分别在原能力节点下创建两个子页，不能把两套 JSON 轮流覆盖同一 pageId。
- Page15 在节点14/16复用同一 pageId；Page18 在节点18/19/20复用同一 pageId。
- 本轮只证明正式发布、当前导航打开和渲染；业务命令 owner、真实审批/签署/采用仍按后续语义验收，不以页面可打开代替。

## 影响范围

- 在线 D849 `Base_NavigationInfo`：Page04-19 对应能力/子页的 `NavigationUrl`、`conid`、`IsShowAtNav`、必要时父子关系。
- 在线 D849 `ProjectToolFile` / `ProjectToolVersion`：16 个 pageId 的三文件、manifest 及历史快照。
- 在线 D849 正式场景：复用 `D3BBA1F0780056C837AC35E9825CAD5A` 的 pagedata 快照。
- 本地源码与 JSON 只读，不在实施过程中重写页面源码。
- `notes/data-space-retirement-ledger.md`：每页发布 proof、导航节点、错误与重开结果。
- `packages/spark-app/src/router/dynamic.ts`：导航提交后重匹配当前已注册 URL。
- `tests/runtime/auth-nav/navigation/dynamic-router-platform-pages.test.ts`：覆盖导航返回晚于初始 config URL。
- 无 Java、后端协议、公共组件或 PageTool 文件修改。

## 技术方案

1. 开工时记录正式数据空间版本、现有 Page11 manifest/pointer 与 21 节点字段。
2. 为 16 套页面定义 pageId 与 nodeId 映射，禁止从标题模糊猜测。
3. 为节点10、11分别新增两个子页；在创建前用父行 `createChildActionState`、正式父身份与当前权限预检。
4. 对每个 pageId：
   - 通过 `ProjectToolFile` 正式 DataView 创建三个工作文件；
   - 分别写入仓内 `rule.json/script.js/style.css`；
   - 按文件保存并精确回读；
   - 绑定正式主场景；
   - 生成三文件快照、pagedata 快照及 publication manifest；
   - 切换节点 `VersionId` 并精确回读。
5. Page11 已发布：保留现版本作为新子页的来源，不重发已确认版本；只在结构调整时迁移导航绑定。
6. Page15/Page18 的复用节点仅复用已确认 pageId/manifest，不复制三文件目录。
7. 逐页发布后刷新运行导航，在当前 SPA 打开并关闭/重开页面实例，核页面标题、正式 node/page/scenario 身份、请求失败或明确空态；不刷新浏览器、不冷重启。
8. 任何文件、快照或指针 unknown，保留原 attempt，停止该页并只核原结果；其它已确认页继续。
9. 目录、快照和导航分别确认；不承诺跨来源事务。若节点创建权限缺失，保留已发布 pageId 但标该节点 blocked。
10. 全部 16 套确认后复核 19 页逻辑路由、旧误接 URL 删除/替换、无重复 pageId、无空目标菜单。
11. 导航 commit 后比较当前 route record；仅当新托管路由已正式注册且解析 record 变化时，replace 同一 fullPath 一次以重建 config route/meta。

## 兼容性

- Page11 当前 `cfg:smart-bid-authoring-page11` 在结构迁移前后保持可打开。
- 其他 15 个 pageId 新建，不改已有目录或旧 84A。
- `Vue:` 系统页不参与 SmartBid PageTool 发布。
- 重复节点复用同一 pageId/manifest，不复制资源文件。
- 租户生命周期仍由 JWT 承接，不创建 SmartBid 页01。

## 验证计划

- 每页工作文件、快照、manifest、VersionId 分别回读。
- DynamicRouter 晚注册：初始 URL 在 `registerRoutes()` 前进入，导航提交后 currentRoute.meta 必须具备 pageId/nodeId，PageRuntimeView 可创建。
- 当前 SPA 再次导航打开后检查 `nodeId/pageId/scenarioId` 一致；不执行整页 reload。
- Page04-19 逐页渲染 smoke，先验标题/结构，再核 host 命令缺输入时的明确错误，不要求触发业务写入。
- Page11 保持可读；Page12/14 子导航与 Page15/Page18 多节点复用分别验证。
- 全量运行导航刷新后统计 16 个配置工具入口、2 个新增子页及复用节点。
- `pnpm run typecheck`、目标 Vitest/ESLint、`git diff --check`、`pnpm run verify:docs`。
- 失败页记录：已确认文件、待核快照、旧/新指针、导航状态及不可重发 attempt。

## 风险项

- 节点10/11 子页创建可能受后端当前数据权限限制；届时只能完成 14 个直接绑定页及已存在的 Page11，剩余 2 页阻断。
- 清空旧误接 URL 已出现 null/空串读回不一致；批量发布必须只写新规范 URL，避免额外清空请求。
- page04-page19 大多没有显式 DataView key，动作依赖 route query/host；当前 SPA 打开只证明 JSON/host 装配，不证明全部命令业务写入。
- 同一 pageId 多节点复用必须保留 nodeId，不可按 pageId 取第一个导航身份。
- 文件、pagedata、蓝图三来源分别持久化，失败只能逐来源恢复，不宣称事务回滚。
