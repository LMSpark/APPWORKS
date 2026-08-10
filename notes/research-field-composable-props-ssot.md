# 字段 composable props 语义研读

字段运行时的六个 composable 都需要接收 Vue props 投影。开启 `exactOptionalPropertyTypes` 后，这些输入既允许属性缺失，也必须接受 Vue 在运行期提供的显式 `undefined`，因此六处分别声明了完全相同的 `OptionalWithUndefined<T>` 映射类型。

这不是六个模型，也不是全仓通用工具；它是 spark-component 字段运行时的内部输入规则。真实所有权应位于 `components/fields/context`，由 context、control、basic、option 六条字段组合链共同消费，但不加入 spark-component 公共 barrel。

唯一内部合同命名为 `FieldComposableProps<T>`：名字表达字段 composable 的输入边界，映射结构继续保留“可缺失或显式 undefined”的真实 Vue 行为。
