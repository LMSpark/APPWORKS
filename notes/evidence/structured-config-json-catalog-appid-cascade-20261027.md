# 结构配置目录 AppId 级联缺陷与 SPA 验证（2026-10-27）

## 缺陷与 RED

当前导航场景：`FFDEF2AED3E19A38C0FCDDC748CF939B`（JSON 数据管理）。正式 Base_JsonData 字段投影包含 `rowid/name/updater/path` 等字段，没有输出 `AppId`。旧 `loadStructuredConfigCatalog` 为所有目录增加静态 `AppId` 输入 DataTable，并将其级联到目录 DataView 的 `AppId`，导致在实际发出目录查询前触发形状校验异常。

实施者保存的 RED 原始测试输出已归档到 `structured-config-json-catalog-appid-cascade.RED.txt`。失败明确为：

```text
Error: Target field "AppId" not found in view "Base_JsonData:default"
  at DataSet._assertCascadeShape (.../packages/spark-data/src/dataset.ts:1269:15)
  at DataSet.addCascade (.../packages/spark-data/src/dataset.ts:1287:10)
  at loadStructuredConfigCatalog (.../src/lowcode/resources/structured-config/structured-config-catalog.ts:66:13)
```

首轮夹具遗漏既有 createuser 过滤配置，后调整夹具后 RED 才精确复现目标错误。未把首轮误报当作缺陷证据。

## 修改与请求边界

删除结构配置目录装配器的静态 AppId 表及本地级联，清理 6 个目录入口的 `applicationId/scopeInputTable` 接线。保留登录/当前应用存在校验及 request-scope token 代次守卫。目录仍由正式模型装配 DataSet/DataView，经 `DataSpaceRuntimeApi` 执行查询；X-AppId 继续由 `LowcodeApi.readRequestScope()` 随运行查询请求注入。本地测试确认请求头带 X-AppId，且不存在 AppId 查询过滤。未改正式模型、pagedata、服务端 Java，也未写线上业务数据。

## 自动化验证

- RED：`pnpm exec vitest run tests/runtime/page/structured-config/structured-config-catalog-load.test.ts`，1 个 JSON 用例按旧行为失败，错误如上。
- GREEN/主控独立复核：`pnpm exec vitest run tests/runtime/page/structured-config/structured-config-catalog-load.test.ts tests/runtime/page/semi-structured/json-data-page.test.ts tests/runtime/page/semi-structured/excel-import-list.test.ts tests/runtime/page/semi-structured/pdf-inspect-list.test.ts`，4 files / 7 tests passed。
- `pnpm run typecheck` 退出码 0。
- 对 9 个改动源码/测试文件运行 ESLint，退出码 0；`git diff --check` 无输出。

主控 GREEN 命令与结果见 `structured-config-json-catalog-appid-cascade.GREEN.txt`。

## 真实 SPA 只读烟测

使用已有认证会话在 `127.0.0.1:5273`，从应用导航打开 JSON 数据页，URL 的 `__sparkNavigationId` 为 `FFDEF2AED3E19A38C0FCDDC748CF939B`。修复前页面显示 `Target field "AppId" not found in view "Base_JsonData:default"`；修复热更新后页面通过标准表格显示目录 `Total 11`，没有页面错误或控制台 error。选择 `Base_DepartInfo.json` 后，树内容视图完成读取并显示 `$` 根对象及 5 个字段（Code、Message、Type、Extras、Time）。只做目录/内容读取和行选择，没有保存或修改。

真实页面证明 DataView 目录查询与内容读取正常；真实 X-AppId 后端隔离效果仍不在本次证据范围内，测试断言的请求头只证明客户端沿正式 scope 发出，不单独证明服务端授权/隔离结果。

## 尚未关闭的整体差距

通用目录的 DataView 仍在 TS 中按当前模型元数据动态装配，尚未迁移为正式 pagedata 所属场景配置；这次仅移除了无效的本地 AppId 级联，不宣称四文件配置驱动或所有数据游离问题已经解决。各目录的权限投影与全局读写范围仍应分别以正式服务返回为准。
