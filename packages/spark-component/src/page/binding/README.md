# page/binding

页面规则绑定层：

1. `bind-normalize.ts`：事件与 `on*` props 归一化
2. `index.ts`：绑定层统一入口

职责：

1. 把脚本函数名包装成可执行闭包
2. 把 action descriptor 包装成运行时执行器
3. 保持 SparkNode 输入结构与运行时 props 结构一致