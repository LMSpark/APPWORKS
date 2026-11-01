# 外部服务场景

由应用清单登记，运行时经同一场景资源 DataView 读取。

- `api-provider/pagedata.json`：服务商目录、选中定义和新增视图。
- `api-config/pagedata.json`：服务商公共参数、头部和令牌前缀；输入为 providerId。
- `api-interface/pagedata.json`：接口定义、输入参数、头部和输出视图；输入为 providerId。

这里只保存正式模型绑定、视图、校验和级联，不保存账号凭据或业务运行数据。模型与字段仍读取正式数据库记录。
