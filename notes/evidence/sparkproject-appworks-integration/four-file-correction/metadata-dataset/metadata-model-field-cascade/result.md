# 元数据模型选择到字段选项

2026-10-09，主控直接实施，本次限定闭环验收通过；整体 AppWorks 集成仍未完成。

## 落地内容

生产配置只改 `config/pages/data-platform/data-space-design/pagedata.json`，测试只改既有 `lowcode-data-space-metadata.test.ts`。前后文本及 SHA256 在本目录。

- Base_DataModel.modelOptions 提供当前 formid 空间的模型，Base_DataModel_Field.modelFieldOptions 提供选中模型所属字段。
- 两个视图不自动加载或自动选首项；按正式 rowid 标识选择，以 Name 展示，使用原生分页、排序和 formid 过滤。
- model-field-options 级联的输入是父视图选中主键数组，映射到子 dataModelId 的 in 过滤；没有行端点。只换指针不重查，清空选择返回空字段集合。
- 原 default/design*/apiInfo* 仍有完整空间语义，旧页面的全量字段与新增操作不借新候选视图执行。新视图属于现有 DataTable，实例和生命周期属于元数据 DataSet。

没有新增运行时代码、Java、UI或另一个查询/保存入口。旧页面恢复仍是后续任务。

## 真实接口证据

`online.mjs.txt` 直接调用现有 openLowcodeDataSpaceDesignSession，消费本仓最终配置；不是运行时添加视图的模拟。线上58次只读请求、写入0，四个元表仍为1空间/7模型/119字段/0关系；目标定义仍为7个DataTable。

按实际选择依次验证1、2、另1、0个模型，字段结果为4、11、7、0，逐个字段ID和独立读取的完整元数据比对，且 dataSetId 和 dataModelId 均正确。DataMember.Value 保持数组，DataView.value 保持字符串。对应 sourceConfigHash 与冻结配置相符。

已授权测试目标与元空间的远端 pagedata 均合法且 viewCascades=[]，没有可迁移的旧级联记录；检查前后远端文件校验值一致。该结论仅覆盖这两个空间。配置目前在仓内元数据入口生效，未发布远端 pagedata。

## 验证

- 新行为测试先因缺少选项视图失败；写入配置后最小4项通过。
- 相关4套件99项通过，12.58秒，包含旧目录四文件行为和设计会话。
- 最终类型、精确Lint、pages-config及限定diff-check通过。测试中首次误用await同步方法及unknown/includes类型错误已修正，原失败日志保留。
- 完整根回归：211套件2773项全部通过，389.73秒，`pnpm exec vitest run --maxWorkers=1`，退出0；运行期间未改生产配置或测试、未并行编译、未调整超时和断言。两个源文件最终哈希复核一致。
- 只读探针首次凭据外层结构判断错误，在未请求后端前失败；改为取已存储对象的Credential属性后认证及请求成功。未记录密码、token或完整业务行。

## 继续项

完整数据空间设计器尚未恢复，模型→命名视图→字段/参数的所有设计输入也未全部接线。DataTable操作配置其余项、默认值/自增的正式归属、静态定义数据和旧布局迁移仍按主计划完整性矩阵处理。现有语义门禁缺口不因本配置闭环通过而消失。
