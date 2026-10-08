# 输入参数编辑离线验收

状态：local-verified，待主控专用空间在线验收

本轮按已批准的 `notes/plan-data-space-input-parameters-edit.md` 完成七文件闭环；未在线写入、部署、提交或推送。主控负责专用空间 `97DCB03F75AADEAE6B102B062DB71CEA` 的正式操作、原值恢复及浏览器验收。

## 完成与证据

- 使用正式 `Base_DataSet@designParameters` DataView/DataSet 和 `SparkPageRenderer` 验证受控参数数组、正式 `inputParams` E/write 权限、DataView editing overlay、保存请求/回执/刷新与重挂载恢复；不新增参数 DataView 或保存 API。
- 证明成功保存后的明确重读、原值精确恢复。离线夹具将实际行从 JSON 数组正式保存，再通过同一正式 DataSet 保存字面 `null`；断言 CRUD wire `Changed.inputParams === null`、成功 receipt 和 refresh 后原值为 null。
- 覆盖 models=[] 目标、取消零写、未变化零写、别名/未知属性保留、只改触碰项、删除前项后保留无 ID legacy 项、Name:null 仍只读可见但不能编辑、非法编辑零写、隐藏/脱敏/无 E 零写、未知保存结果不重试、真实确认/取消、save/remount busy、overlay remount、重建失败后页外恢复及恢复重读失败后的可操作重试。
- RED→GREEN 根因记录：无 E fixture 令编辑入口正确拒绝；fixture 补正式 `editableFields:['inputParams']` 后真实权限路径通过。历史 Name:null 因只读解析混入编辑校验而使整页隐藏；拆分读取结构解析与编辑校验后只读可见、编辑仍拒绝。无 ID 删除前项后按 index 匹配错误；改为按未消费的完整对象语义保留 legacy 项。页面 owner 重挂载重建失败原先无恢复入口；添加页门外恢复路径并覆盖实际 UI。最后串行恢复测试发现旧 MessageBox leave-transition DOM 留在 Teleport，后例点中了陈旧按钮；改为选择最新 dialog 按钮后两用例串行通过。
- Scanner 独立 RED→GREEN：仅加 `data-space-parameters-editor` 导入和注册断言时，两个 view-prefix 场景均失败（组件不在 fixture）；加入与生产相同 `src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue` 路径的 fixture 后，两个场景均通过，并分别断言 lazy import 与 registry key。
- 在线验收前的窄修正：根据主控提供的 1210px viewport / 606px dialog 溢出截图，仅调整参数组件 scoped CSS。组件以 `width:100%`、`min-width:0` 和 `container-type:inline-size` 约束容器；行列使用 `minmax(0,...)`，在容器 42rem 内切为两列、24rem 内单列，避免只依据 viewport 宽度的旧断点。组件 typecheck 与精确 lint 通过；页面实测由主控完成。
- 06:08 回读修订：主控证据显示正式保存 receipt 成功后 `DataView.refresh()` 重放静态视图条件，实际 Filter 为 null 且返回500/1185行；没有再次写入，主控已用同一 DataSet 将原值恢复为 null 并确认 clean。保存成功后的脚本回读改为在同一个 DataView 调用 `loadFromServer`，显式传入白名单 fields `rowid,inputParams`、`rowid eq capturedTarget`、`rowid:asc`、`allPages:true`、`maxRows:50000`；异步返回后重新校验 PageRuntime、路由目标、DataSet、绑定 DataView，再核身份、权限和值。显式放弃后的重新读取与 retry 直接调用已有 `reloadDesign()`，不先发无条件 `refresh()`；前后均验证相同 page/target/DataSet/view。测试 fixture 增加第二个空间行并按实际 Filter 过滤，使 Filter:null 确实返回多行并暴露错误；正常保存、恢复失败和 retry 的所有参数查询均断言 filter 目标与 fields。精确 null 恢复测试也增加第二空间行，改用同样显式的正式 DataView 查询并断言查询条件。
- 同范围 checkbox 语义修正：移除 Element Plus `ElCheckbox` 外层嵌套的原生 `label`，由组件自身 label 提供可访问文本；组件测试验证 checkbox 值更新并发出受控数组。主控浏览器复核发现 Element Plus 原生 input 尺寸为零，自动化 `getByRole().check()` 因隐藏输入定位失败；可见 `.el-checkbox__inner` 和文本点击均能切换。此为测试定位边界，不记录为产品勾选故障修复，也未修改 Element Plus 样式或事件。

## 精确验证

- 基线：`pnpm run typecheck`，通过。
- 最后类型检查：`pnpm run typecheck`，通过。
- 精确 lint：

  `pnpm exec eslint src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.props.ts config/pages/data-platform/data-space-design/script.js tests/ui/views/data-space-parameters-editor.test.ts tests/app/config/spark-components-loading.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`

  通过。
- `pnpm exec vitest run tests/ui/views/data-space-parameters-editor.test.ts tests/app/config/spark-components-loading.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`：3 个文件、42 个测试通过。
- `pnpm exec vitest run tests/app/config/spark-components-loading.test.ts`：1 个文件、2 个 prefix 场景通过；`pnpm exec eslint tests/app/config/spark-components-loading.test.ts`：通过。
- overflow CSS 修正后：`pnpm run typecheck` 和 `pnpm exec eslint src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue` 均通过；未重跑全套测试，等待主控页面实测。
- 回读/checkbox 修正后：`pnpm run typecheck` 通过；精确 lint `pnpm exec eslint src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue tests/ui/views/data-space-parameters-editor.test.ts config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts` 通过。
- 回读/checkbox 修正后运行三套计划测试：`pnpm exec vitest run tests/ui/views/data-space-parameters-editor.test.ts tests/app/config/spark-components-loading.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`：3 个文件、43 个测试通过。
- `pnpm run verify:pages-config`：通过。
- `pnpm run verify:page-design`：4 个文件、53 个离线验证通过。
- `pnpm run verify:ai-codegen`：991 个文件通过。
- `pnpm run verify:dirs`：通过。
- `git diff --check`：未全仓通过，报告到既有、范围外 `src/views/tenant/AppList.vue:183-194` 的 trailing whitespace；本轮未修改该文件。七个目标文件的精确 ESLint 通过。

## 前像与当前指纹

四个既有目标文件的原始快照保存在 `notes/evidence/sparkproject-appworks-integration/four-file-correction/parameters-edit-before/`。对应 SHA-256：

- `config__pages__data-platform__data-space-design__rule.json`: `C47A666474EB6653DFECC0CC1EAB1653CD48C92E5605B2A41305B641F5750AC4`
- `config__pages__data-platform__data-space-design__script.js`: `08F8CC0FA429F4247076381EEAA447B96DD2275C978D66FE19BBA41EB80F3170`
- `tests__app__config__spark-components-loading.test.ts`: `5CC9C2D39C1DD009E7BCCA38BB483FBEAD3278137EEEAC3AE3741E0980E69848`
- `tests__runtime__page__design__data-space-design-four-file.test.ts`: `34F2258F7E7F2AA6CFD84722392B12F5F6A601B0A952D724D352EF9CE0179A4C`

本轮新增组件和组件测试之前不存在，故无旧文件前像。

当前七文件 SHA-256：

- `config/pages/data-platform/data-space-design/script.js`: `ABC904D9BF157E258FBFA9C8B28D4D7DD02AFF6FC6E50F9200B2E866F6BBC084`
- `config/pages/data-platform/data-space-design/rule.json`: `5DD6EEB46FEC50208E3A97272BB987540AE2912127A40566741460E0AC9308BE`
- `src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue`: `910A7794A38A02BFA9EB4A535690FBC9DD7148851EFAF89F6264B438CD890225`
- `src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.props.ts`: `C81E82CE91844913E36F6765A84C108654B50614D2E91F7D7B979D3ED1E66676`
- `tests/runtime/page/design/data-space-design-four-file.test.ts`: `BAEE03B779EC39D5D94E26EBB8BFEE54DFB24E813429CBE5CEF08883080DA8D5`
- `tests/ui/views/data-space-parameters-editor.test.ts`: `4DBA9592A27B78C6E0AD145E605F444BC474A4799BCAFA876440DA9B7E64FAF4`
- `tests/app/config/spark-components-loading.test.ts`: `87338FA60D60F55F7CEE69BC3EE8549EDD85551DBE88F8678B0428C4B613AC01`

