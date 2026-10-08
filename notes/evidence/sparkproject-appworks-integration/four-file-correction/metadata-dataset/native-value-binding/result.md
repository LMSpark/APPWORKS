# 原生值绑定与已有字符串格式兼容

此子闭环通过，通用值级联执行迁移尚未完成。主控直接实施，无代理、UI恢复、Java或线上写入。

现有 DataMember 入口新增 Value：带 dataField 时以指针定位并读取编辑覆盖后的实际字段值；不带时返回选中主键数组。保留原生类型和空数组，普通含逗号字符串不拆分；值快照不允许反向修改原数据；对象型字段值不会被当成新的行上下文。不可读字段、不可读主键和销毁来源明确失败并提供诊断。

DataView.value / SelectionDelegate 未修改，保留 valueField/selectionDelimiter 的原字符串 getter/setter。测试覆盖业务 code 字符串与主键数组分离、原序列化行顺序、单选、空选择、前导零字符串主键和数字0主键；字段覆盖普通字符串、0、false、null、数组、对象、编辑/取消及指针变化。

验证：基线与最终根typecheck、两路径lint、AI扫描1019通过；新行为先3红，生产修改后仅旧序列化排序的测试预期与现有源码不符，按其getAllRows顺序修正；最小16项、相关15套件212项通过。此次未重复根全套或线上验证，不能引用前一轮2730项支持新改动的全量回归声明。

精确范围：core/data-view-key.ts、其既有data-view-key.test.ts及直接API文档。前像before/、差分changes.patch、最终哈希final-hashes.json、序列化owner哈希serialization-owner-hashes.json、门禁verification.json均保留。

下一闭环必须让级联真正消费该值绑定，按值比较触发查询并由新选项影响子值，删除旧行依赖；目前仅取值入口完成，未验证“指针变但值相同不查询”或子值下游传播。
