# ClassModel 公共符号索引研读

ClassModel 生成器使用 `exportedOnly: false` 投影每个 DTS shard，目的是把模块内部类型也保存在该 shard 的 `models/$defs` 中；但同一批 `projection.symbols` 又直接作为跨 shard 的裸类名 `classIndex` 和 `componentIndex` 来源。

这混淆了两种身份：

- shard 内模型由 `sourcePath + symbol` 唯一定位，可以包含不同模块各自的私有 `Props`。
- 全局 `classIndex` 只适合公开、可跨模块引用的导出符号；裸类名只有在这个集合中才应唯一。

当前 9 个重复项全部是不同 Vue 模块的私有 `Props`。生成器保留第一次扫描结果并跳过后续结果，使全局索引取决于扫描顺序，且被跳过项不能按裸类名寻址。

正确边界是继续投影所有声明到 shard，但 `DtsFileProjectionDocument.symbols` 与 `module.symbols` 只记录带 export modifier 的公共符号。公开符号如果仍重名，manifest `duplicates` 必须由验证门禁直接拒绝。
