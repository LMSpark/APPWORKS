# ClassModel 级联更新参数投影

2026-10-09，主控直接实施。本次参数投影闭环验收通过；此文不表示整体集成完成。

## 闭环和范围

真实 `DataSetCrudTool.updateCascade` 的交叉参数曾只生成 updates，cascadeId 被拒绝；Partial 同时被错误替换成完整级联定义。修复声明到 schema 的通用投影，保持 TypeScript 源声明为真源，不改变 DataSet 的业务签名或持久格式。

五个生产文件、一个既有测试文件；其中一个新增内部编译类。原生成器刷新 generated/dts-class-model。精确前后像及哈希保存在本目录，generated-before 保留此前混合工作树的全部生成物。没有代理、Java、线上写入、业务设计页、提交或分支操作。

- ClassModelDeclarationSchema 使用同一 TypeScript Program 解析交叉、联合、Readonly、Partial 的数据形状；是否可写和是否必填分开。命名递归和运行时对象保留引用，数组、元组和字典保持结构。
- 投影器保留完整类型别名 schema；原声明成员缓存继续从语法取得，避免将继承/映射属性伪造为有独立声明的成员。
- bundle 同时转换别名根 schema 的引用，loader 加载这些根引用及容器内引用；局部成员关系不覆盖完整别名 schema。
- 内存 emit 的虚拟目录必须对模块解析可见，否则物理文件测试正确而正式生成的导入仍然未解析。复用调用方 CompilerHost，只补根声明所在虚拟目录的可见性。

## 行为证据

新增同一行为测试分别使用磁盘和纯内存声明，均经声明→bundle→loader→native script：按 ID/端点更新和空局部更新成功；缺少定位、混写不完整端点、错误类型/值策略、缺少嵌套必填字段拒绝，owner 调用计数保持。Readonly 必填、递归、数组、可选元组、字典、跨分片 Policy 引用均覆盖。

真实 `probe-runtime.mts.txt`：通过生成模型执行 DataSetCrudTool 创建 selection-string 级联，再按 cascadeId 更新 valuePolicy 并核对实际实例；ScenarioViewFile 校验、写本地文件、独立读回保持新策略及 valueField/selectionDelimiter。旧 rowMode 被拒绝。`update-schema-result.json` 的 ok=true 为真实脚本结果。此证据是本地文件往返，不冒充线上保存。

DataView.value 的原字符串编解码没有改动；前一闭环的选中值格式兼容保留。本次解决配置更新被错误 schema 阻断的问题。

## 验证与迭代

- typecheck 基线及最终通过；六路径 Lint 通过；AI codegen 1026 通过；限定 diff-check 通过。
- 最小交叉类型测试先失败后通过；扩展运行时对象/数组用例先失败后通过；纯内存 import 用例先失败后通过。
- 中间 ClassModel 8 套件 66 项通过；最终磁盘/内存两个新增用例均通过。最终完整集合为 211 套件 2771 项，全部通过，384.52 秒，`pnpm exec vitest run --maxWorkers=1`，进程退出 0，见 root-serial.log。
- 首次全量生成暴露 HTMLElement 展开递归，失败生成物已恢复原备份；对应回归修正后全量生成通过，758 分片、1363 classIndex、17.205 秒。最后注释/声明缓存增量生成 14.147 秒。
- guide JSON Schema 结构门禁通过；语义缺口总数前后均 2290，阻断类别前后均 313，未新增语义债务，全仓语义门禁仍不通过。
- 首次完整回归 2770 项通过、1 项原 5000ms 超时，218.47 秒，保留 root-final.log。原阈值单独复验通过（测试 4.16 秒），随后串行全套通过。未改阈值或断言；首次失败也未删除。完整复验期间没有并行编译或修改实现。
- 六个实现文件最终哈希一致；生成物哈希保存在 generated-final-hashes.json。最后一次类型/Lint检查后仅补三条直接声明说明，行为最小复验、生成及上述完整回归均基于最终源内容。

## 仍待总任务完成

DTO 结果代理直接返回整对象为空的问题仍是独立断点；本轮通过实际对象与显式字段读取核验更新，不冒充完整 DTO 返回序列化已通。线上旧级联配置、业务设计器、整体 AppWorks 集成和语义门禁仍未完成。整体目标保持 active。

可复用经验暂留本记录：内存声明 Host 的 fileExists/readFile 足以旧语法投影，但不足以 TypeScript 模块语义解析；必须同时提供虚拟目录。尚未写入 knowledge。
