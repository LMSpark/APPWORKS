# @spark-appworks/vite-plugin-spark-catalog

SPARK 组件扫描配置与命名工具。

这个包不再生成 AI catalog，也不再解析组件标签。它只保留前端自动注册仍然复用的扫描模式和小工具函数。

## 当前职责

- `COMPONENT_SCAN_PATTERNS`
- `COMPONENT_EXCLUDE_PATTERNS`
- `SYNC_COMPONENTS`
- `ASYNC_COMPONENTS`
- `toKebabCase()` / `inferSkillType()`

## 测试

```bash
pnpm --filter @spark-appworks/vite-plugin-spark-catalog run typecheck
```
