# JSON Schema 类型所有权研读

`packages/spark-json-document/src/schema/schema-types.ts` 是 JSON Schema 公共类型的唯一出口，定义并导出 `JsonSchemaType`、`JsonSchemaObject`、`JsonSchema` 与 `JsonSchemaDefs` 相关结构。

源码中存在两处第二身份：

- `schema-standardize.ts` 本地重复声明了与公共 `JsonSchemaType` 完全相同的七值联合，仅供标准化函数内部使用。
- `spark-ai/class-model/metadata/resolve-api-object-metadata.ts` 将 `schemaDefs` 的值本地命名为宽泛的 `Readonly<Record<string, unknown>>`，随后直接传给要求 `JsonSchemaDefs` 的 `dereferenceRuntimeApiMetadataSchemas`。该别名既与 `JsonSchemaObject` 重名，又弱化了真实 JSON Schema 合同。

两处均无独立领域语义。标准化逻辑应直接消费同包 `JsonSchemaType`；AI 元数据解析应直接声明 `JsonSchemaDefs`，与解引用入口和其他 ClassModel 调用方保持同一合同。
