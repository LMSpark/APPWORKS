# 缺失布局首次创建：本地实施结果

状态：本轮生产与测试修改已冻结；待主控验收。范围仅限 `layout-create-brief.md` 的 D13 闭环。

## 行为及落点

- `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css}`：明确缺失时从当前正式 DataView 查询投影生成只读预览；独立确认/取消；确认重查全模型、字段、关系、参数、目标及可读字典，逐字段先核读取权限后生成指纹；再次核文件缺失，调用创建一次，随后完整重载并比较布局原文与正式投影。初始图只保存版本、正式 ID/关系端点及确定性坐标，不复制完整关系过滤表达式到图文件；可读完整表达式仍参与指纹。未确认、快照或权限变化、已有文件均不写。写结果未知锁住自动重试；写成功而后续重载失败显示“已创建，但后续完整读取未通过”。
- `packages/spark-component/src/runtime/app-services.ts`、`packages/spark-component/src/page/context/buildPageContext.ts`、`src/lowcode/data-space/lowcode-data-space-layout.ts`：新增独立 `createDataSpaceLayout` 命令，保留已有 `saveDataSpaceLayout(expectedContent:string)`；沿当前 PageContext generation/abort/设计 DataSet owner 与应用 scope 校验。底层仅在明确 404 时创建，使用现有 `uploadTextVersion` 的 `isReplace=false`、真实文件名及字节回读合同。服务端缺失检查与写入之间非原子，不承诺 CAS；重名副文件或未知结果不自动清理、重试。
- `packages/spark-component/API.md` 更新脚本合同。三套行为测试与两套既有夹具在 brief 指定的五个文件内更新；真实 Renderer 控件链确认后，另用同一已保存原文创建新 PageRuntime/Renderer 重挂载，核节点坐标且不二次创建。

## 验证证据

- 宿主/API 首个最小红绿：`layout-create-writer-red.log`、`layout-create-writer-green.log`、`layout-create-host-red.log`、`layout-create-host-green.log`。页面预览、确认、变更、真实 UI 的最小绿分别为 `layout-create-page-first-green.log`、`layout-create-confirm-smoke.log`、`layout-create-change-smoke.log`、`layout-create-renderer-smoke.log`。拓扑预期首次失败 `layout-create-topology-smoke.log` 是测试将环/断开分量错误地预期到同一层；按现有确定性规则更正测试后 `layout-create-topology-green.log` 为 exit 0。新目标变更 `layout-create-target-green.log`、迟到创建 `layout-create-lifetime-green.log` 均 exit 0。
- 五套合并命令：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts packages/spark-component/src/tests/runtime/createSandbox.test.ts`，exit 0，5 文件 202 项通过，见 `layout-create-final-tests.log`。此后仅补两条验收测试，没有改生产代码；定向 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t "routes the rendered preview and confirmation controls|reports confirmed creation"`，exit 0，2 项通过，见 `layout-create-reopen-postwrite-smoke.log`。
- 最后 `pnpm run typecheck`，exit 0，见 `layout-create-final-typecheck.log`。修改冻结前九个代码文件的精确 ESLint 命令见 `layout-create-final-lint.log`，exit 0；最终仅测试文件再次运行 `pnpm exec eslint tests/runtime/page/design/data-space-design-four-file.test.ts`，exit 0，见 `layout-create-test-final-lint.log`。

## 证据边界

- 本轮修改前 13 个计划文件的 SHA-256 清单是 `layout-create-byte-baseline.txt`。它**仅有哈希，没有修改前字节副本，不能凭其恢复预像**；未把当前内容伪称开工前备份。
- 当前 PageRuntime 的 `isDirty` 只覆盖 DataView，Pool 关闭、重载或项目切换及 Renderer release 不承接 script 内布局草稿、在途或未知状态。本轮迟到 PageContext 回调拒绝测试仅证明该调用方返回 stale，**未验收跨 Renderer 重挂载的草稿/在途/未知保护**。普通 KeepAlive 标签切换不等于每次重挂载。主控已有单独 `layout-lifetime-review.md` 待后续闭环。
- 未部署、未在线写、未修改后端；服务端文件创建竞争窗口仍存在。主控负责 pages/AI 等全局门禁及最终整页验收，本轮本地测试不冒称线上零回归。
