# 工具目录索引

`tools/` 存放少量面向工程体系的辅助工具，通常被构建、验证或本地开发流程调用。

## 当前内容

- `vite-plugin-spark-components.ts`：构建期组件自动注册工具。
- `vite-plugin-class-model-static.ts`：ClassModel DTS bundle 静态服务 Vite 插件。
- `verifier-common.mjs`：校验器共享库（源码遍历、违规输出、CLI 参数解析）。
- `verify-architecture.mjs`：结构约束校验工具。
- `verify-ai-codegen-rules.mjs`：AI 代码生成硬门禁，禁止游离 interface、机械 `Interface/Impl` 命名、非 `as const` 类型断言、已移除 AI API、TypeScript namespace、公共 `export *`、参数列表内嵌 JSDoc，并限制 named import、公共入口平铺导出和过长位置参数继续膨胀。
- `verify-ai-model-spec.mjs`：AI 模型规格校验（支持 `--strict` 模式）。
- `verify-ai-model-schema.mjs`：AI 模型 JSON Schema 校验。
- `verify-dependency-catalog.mjs`：pnpm catalog 版本与运行时归属校验。
- `verify-docs.mjs`：文档命名与位置治理校验。
- `verify-pages-config.mjs`：pages-config 命名、必需文件与 manifest 白名单校验。

## 验证入口

- `pnpm run verify:arch`：包依赖、跨包相对导入、框架无关包、`spark-ai` 公共 subpath 边界。
- `pnpm run verify:ai-codegen`：AI 代码生成规则。
- `pnpm run verify:ai-model` / `verify:ai-model:strict` / `verify:ai-model:schema`：AI 模型规格与 Schema 校验。
- `pnpm run verify:class-model`：DTS ClassModel bundle 存在性、spark-ai lint/typecheck 与关键单测门禁。
- `pnpm run verify:deps`：基础依赖 catalog 与归属。
- `pnpm run verify:docs`：文档命名与位置治理。
- `pnpm run verify:pages-config`：动态页面配置 manifest 与 pageId 命名。
- `pnpm run verify:rules`：架构边界、依赖 catalog、pages-config、AI 生成规则、文档治理与 `verify:class-model`；根 `verify` 已接入该入口。

## 与 scripts 的边界

- `scripts/` 偏向"可执行流程"。
- `tools/` 偏向"被流程调用的辅助工具或校验器"。

如果一个文件主要职责是驱动一段维护流程，放 `scripts/`；如果主要职责是被构建或验证流程复用，放 `tools/`。
