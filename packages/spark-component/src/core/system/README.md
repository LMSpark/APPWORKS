# system

系统层：

1. `spark.ts`：Spark 命名空间
2. `plugin.ts`：Vue 插件
3. `registry.ts`：组件注册表
4. `index.ts`：system 层统一入口

用途：

1. 根公共 API 的 system 分组来源
2. 将命名空间、插件、注册表从 `src/` 根目录实现文件中下沉