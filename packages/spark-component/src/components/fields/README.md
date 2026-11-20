# fields

字段层 composable 现在按职责分组：

1. `context/`：字段上下文、权限、显示值和表格单元格展示态
2. `options/`：静态选项、DataView 选项、级联值格式化
3. `actions/`：文件浏览、上传、实体选择等交互动作
4. `data-components/`：直接参与字段值读写的 Vue 字段组件
5. `non-data-components/`：字段层的桥接 / 辅助 Vue 组件
6. `data-components/composables/`：主要服务于数据字段组件的组合函数主入口
7. `non-data-components/composables/`：主要服务于非数据字段组件的组合函数主入口
8. `data-components/support/`：表单规则转换、picker preset 等辅助 TS 主入口

优先入口：

1. `composables.ts`（聚合全部字段层 composable）
2. 查 Vue 组件时优先看 `fieldDataComponents` 和 `fieldNonDataComponents`
3. 查与 Vue 分组对齐的组合函数时优先看 `fieldDataComponentComposables` 和 `fieldNonDataComponentComposables`
