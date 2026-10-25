# Base_TblRln RelshipExp 正式运行值只读回读

- 日期：2026-10-25
- 状态：正式 API 查询成功；只读，未写入。
- 正式模型：A8FB2B2B161125A16FD15ED9581CD15B / Base_TblRln；readModel 回读 ID D2B9B94A1641BB87E6D3D9251A14D70D、PK rowid、13 个输出字段，包含 RelshipExp。
- 运行查询：SPARK Data API 的 DataView 查询，筛选 RelshipExp is-not-null AND is-not-empty，页 1、size 20、allPages=false。服务 Code 200，Count=49，返回20条。8个正式请求包含登录、应用/导航读取、readModel 所需的正式元数据读取与目标运行 DataView 查询；无写请求、无拦截请求。
- 20/20 个首屏 RelshipExp 值类型为 JSON 字符串，均可解析；结构顶层键为 Filters、Type，首个过滤节点含 Field、Operator、Type、Value、ValueFun，且 ValueFun 含 Field、Type。字段引用路径 $.Filters[0].Field 与 $.Filters[0].ValueFun.Field 的值类型均为 string。报告未记录表达式内容、物理行完整 ID或记录原文。
- 边界：首屏载荷证实字符串格式候选，但没有验证 RendererFilterExpression 的读取、编辑、取消、提交或服务端写回兼容；不证明余下29行都同形。
- 机器可读去敏结果：b2-relation-runtime-expression-read.json。只读探针：b2-relation-runtime-expression-probe.mjs。
