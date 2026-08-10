# DataView 到后端过滤操作符查表研读

`src/lowcode/data-space/lowcode-data-space-assembler.ts` 将运行时读取到的 DataView `op` 字符串映射为 lowcode `WireFilterOperator`。映射只覆盖后端当前支持的操作符，未覆盖值必须 fail-fast。

当前实现把任意运行时字符串断言成对象的已知键，导致 TypeScript 推导查表结果永远存在，后续 `undefined` 防线成为不可达分支并触发 lint。问题不是防线多余，而是断言掩盖了真实的不可信输入。

正确结构是：映射条目在声明时分别受 `FilterOperator` 和 `WireFilterOperator` 校验；运行时查找面保持 `ReadonlyMap<string, WireFilterOperator>`，使任意后端输入仍返回 `undefined` 并保留显式拒绝。
