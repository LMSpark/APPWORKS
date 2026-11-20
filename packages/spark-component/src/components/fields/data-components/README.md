# data-components

这里存放真正参与字段值展示、编辑、选择或格式化的字段 Vue 组件。

判定标准：

1. 组件直接读写字段值，或围绕字段值完成展示 / 编辑 / 选择动作
2. 组件通常依赖 `useFieldPermission`、`useFieldContext`、`useOptionField`、`useFileFieldActions` 等能力
3. 组件本身是业务字段语义的一部分，而不是桥接层

当前典型组件：

1. `FieldText`
2. `FieldNumber`
3. `FieldSelect`
4. `FieldUpload`
5. `FieldEntityPicker`
6. `FieldUserPicker`