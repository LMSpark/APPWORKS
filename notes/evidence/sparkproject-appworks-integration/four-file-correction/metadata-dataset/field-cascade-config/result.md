# 字段级联配置尝试：已被用户新语义取代

原路径补齐基于 editing-row 的配置 CRUD，红例复现创建要求 parentTable 和列表排除 field；局部 CRUD22项及持久化1项通过。类型检查曾因联合类型展开失败，修改后未完成最终门禁。未验收、未声明交付。

用户随后明确：级联消费通用值；当前行只是取值指针，tablegrid 值为选中主键数组；子选项查询结果反过来影响子值。原前提失效，停止该路径。

六个本轮修改文件先保存至 superseded/，差分 superseded.patch，哈希 superseded-hashes.json；再按 before/ 恢复。恢复前核当前哈希未变化及备份哈希有效，恢复后七路径 before-hashes.json 全部一致。未回退此前已验收的命名视图、查询权限等改动；无Java/UI/线上写入/提交。

当前原生代码仍保留旧行级联，未宣称完成通用值语义替换。接续以 notes/research-data-space-data-chain.md 第6节和主计划最新语义为准。
