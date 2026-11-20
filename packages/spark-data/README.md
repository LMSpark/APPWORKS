# @spark-appworks/spark-data

SPARK 的纯数据层包，提供 DataSet、DataTable、DataView、TreeManager 以及围绕它们的关系、计算列和聚合能力。

## 设计目标

- 让页面数据全部通过 DataSet 流转
- 把联动、选中态、汇总、树结构放进统一模型
- 保持纯 TypeScript/JavaScript 依赖，不耦合 Vue 运行时

## 核心对象

- `DataSet`：正式场景的运行数据空间；也支持独立局部数据集，一次页面调用可持多个 DataSet
- `DataTable`：模型绑定、columns 与多个命名 DataView；静态数据可另有本地来源行
- `DataView`：独立查询、结果、选择、分页、树、编辑与权限消费
- `TreeManager`：树节点缓存、路径展开与嵌套输出

## 开发命令

```bash
pnpm --filter @spark-appworks/spark-data run build
pnpm --filter @spark-appworks/spark-data run typecheck
pnpm --filter @spark-appworks/spark-data run test:run
```

## 进一步阅读

- [API.md](API.md)
- [../../docs/guides/DATA_MANAGEMENT.md](../../docs/guides/DATA_MANAGEMENT.md)
- [../../docs/architecture/DATAFLOW_ARCHITECTURE.md](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)
