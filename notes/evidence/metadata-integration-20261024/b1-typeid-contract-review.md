# B1 条目所属字典字段合同续核

日期：2026-10-24。仓内基线 `59e1e5f0e7fd157093b2ea0faee00725723250e9`。本次仅源链审查与真实只读查询，未更改产品、Java 或正式数据，不是排序保存验收。

## 当前事实

- 正式编辑空间 `69B79AB779DF4C12A5595DACDF3283F1` 的 `_Base_DictData` 模型为 `FBC266CB81A3E3D1D6D67F9B9D7FFF04`。
- `typeid` 字段 `6DEED3F0B04C4AD1B369843C4AD35FD5`：`FieldType=varchar`、`IsOutput=1`、`IsPKey=0`，`ValueFun` 原文为 `{"ParamName":"rowid","Value":null,"Type":"SystemData"}`。当前正式投影因此得到 `computed=true`。
- 经现有 LowcodeDictionary → DataSet → DataView 只读链重新查询：既有字典 `D39BC0D2B65836CD7D80AC84C53C5B99` 返回 7 条，每条 `typeid` 均为该字典 ID；保留 B1 字典 `327D74EC0ABC4196AA75C56D944B8201` 返回 0 条。诊断进程允许登录和 GetData，禁止保存、文件上传及其它端点；18 个 GetData，0 写入尝试。这里的查询是实际服务原生 API 验证，不冒充浏览器 SPA 操作。
- `DictionaryWorkspace.addEntry()` 已通过原 DataView 将字典 ID 写入新行 `typeid`；不是页面缺少赋值。前批保存停在 `prepareSaveRow`，没有发出新增请求，详见 `b1-sort-typeid-gap.md`。

## 参考源码与实际服务的区别

静态 Java 参考版本 `f1620968b6902d799ccc0ae16fc57c86205da03d`，参考前端版本 `791c464b8c6b3c7049ea36ab57546c3481e4d889`；未据此声称部署服务使用相同版本。

1. `PermissionUtil.toFieldParams` 将正式字段的 ValueFun/FieldType 转入查询模型；`BasicFunServiceImpl.mergeFields` 保留模型值函数，REQUEST 只收窄输出，不因请求未携带函数而删除它。来源：`E:/lowcode-jdk17/lowcode-framework/lowcode-anyline/src/main/java/com/htong/util/permission/PermissionUtil.java:824`、`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java:2049`。
2. `ParamUtils.convertFieldToField` 对普通 varchar 字段也会取 ValueFun 的值；非空值可指向另一个物理列，空值才回退字段 Name。来源：`E:/lowcode-jdk17/lowcode-framework/lowcode-base-service/src/main/java/com/htong/util/ParamUtils.java:185`。
3. 参考 `SystemData.getValue()` 没有 `rowid` 分支，返回 null；这能解释参考输出为何回退物理 typeid，与 7 条正式查询相符，但不是实际 SQL 或服务新增行为的证明。来源：`E:/lowcode-jdk17/lowcode-framework/lowcode-common-data/src/main/java/com/htong/valueFun/SystemData.java:66`。
4. 参考 CRUD 的默认值来自物理字段 defaultValue，未把输出 ValueFun 当新增初始化器；参考字典编辑器显式传父字典 ID。来源：`E:/lowcode-jdk17/lowcode-framework/lowcode-anyline/src/main/java/com/htong/service/CrudServiceImpl.java:705`、`:1891`，`E:/r/sparkproject/packages/ui/domain/metadata/src/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-editor.vue:253`。

## 主控裁定与独立复核

不采纳“只按 FieldType=计算字段设置 computed”的宽泛修正：普通物理类型也可能被 ValueFun 改变读取来源，放开写入会造成读写字段语义错配。也不增加 SystemData/rowid 字面量特例，不把它改成另一方向的 GetInputParam 映射。原计算输出守卫保持。

低价助手完成源链追踪；独立 gpt-6-sol 合同复核同意当前不存在证据充分的通用写入放开方案。报告保留在 ignored cache 的 `task-b1-systemdata-contract-report.md` 与 `b1-output-contract-review.md`；前者的 FieldType-only 候选未被主控接受。

## 提交范围确认后的精确候选（尚未执行）

只有确认本字段就是调用方提供的字典外键、现存函数无保留用途后，才通过原元数据字段工作区将上述唯一字段的 `ValueFun` 从完整原文更正为 `''`。Name、FieldType、IsOutput、所有模型/空间身份、查询过滤、字典定义和业务条目都不属于这次配置提交。

这会影响该共享模型的所有消费者，不只是测试字典。用户本批计划明确“排序只改 ordIdx，不夹带设计定义”，因此先提出独立范围确认，未将排序授权解释为共享定义迁移授权。执行前仍必须重新核字段完整身份、基线、当次字段写权限和干净编辑状态；若不满足就保留失败事实。

候选路径是现有 FieldEditSession → DataSpaceDefinitionSave → DataSet.saveChanges；正式回执、回读与 SPA 独立重开分别验证，只接受该字段 ValueFun 的预期业务差异。新模型读取后再在已授权保留的 B1 字典创建 C/A/B，继续原排序、取消、显式保存和 SPA 重开验收。服务拒绝或未知回执仍走现有恢复链，不直接重放，不扩大守卫。

尚未证明：部署服务函数合同、元数据更正写入/回读、三条条目新增、排序保存/重开。完整 B1 的 AI 候选、删除引用完整性和下游消费仍开放。

## SPA 只读定位

在已有 SPA 内进入数据空间目录，按空间 ID 查询“字典数据编辑”，打开设计 → `_Base_DictData` → 字段呈现，`typeid` 行显示“字典类型ID / varchar / 输出 / SystemData(rowid)”；保存与放弃修改均禁用。没有编辑字段、点击保存或执行删除。原配置截图为 `b1-typeid-before-correction.png`，保留工作区用于范围确认。

该空间还显示“尚无视图配置”和 `DATA_SPACE_LAYOUT_INVALID: 旧布局结构无效`；字段工作区仍可读取。这是本次发现的独立存量配置差距，未修改布局或生成新配置，也不把它混入 typeid 更正范围。进入过程中额外打开的 Template DSL Demo 页签只是 SPA 导航落点，不作为验收结果。
