# 全断链 Iteration 0 基线

## 当前基线

- AppWorks 分支：`codex/spark-data-s1-command-safety`
- AppWorks HEAD：`7bd85305ee576bc5dc7b9a7f076fc5867018c2e4`
- 后端只读源码 HEAD：`e1eccc1b56c225212481ba276302d5e6b288e883`
- typecheck 基线：通过。
- 已有未提交文件保留，不并入本轮实现提交：
  - `docs/architecture/README.md`
  - `docs/architecture/project-architecture-audit.md`

## 后端已证实能力

- 文件 V2：
  - `/api/File/v2/stat`
  - metadata 包含 `size/contentType/lastModified/etag`
  - upload result 包含 `sha256/pathCode/filePath/fileName/fileSize`
  - controller 由 `file.v2.enabled=true` 条件启用
- 文件 V1：
  - `content/text`
  - `DownFile`
  - `lastModifiedTime`
  - `N__filename` 快照列表、读取、上传、回读
- 导航：
  - `GetNavigationMenus/{sysId}/{beginNodeId}` 读取应用所有权/ACTIVE 授权
- 逻辑视图：
  - `GetView` / `SaveView`
- CRUD：
  - `BatchTableOperateRequestByCRUD`
  - 普通表使用事务并返回 Added/Changed/Deleted
  - `CrudModelRequest/CrudModelReturn` 无 durable request terminal

## 断点事实

### P0

1. `VersionId` 当前只编码 rule/script/style，pagedata 不属于同一发布集合。
2. CRUD 响应丢失后，没有原 request terminal 可查；精确恢复依赖已知正式主键。
3. 正式入口 READY 需要蓝图候选、授权 node、工具/场景身份和四文件集合同时成立。

### P1

4. 数据库、工具文件、pagedata、业务命令和文件分别持久化，不存在跨来源事务。
5. 设计、预览、发布是不同生命周期，需显式 `mode/sourceRevision/publicationRef`。
6. unknown capture 已存在，但 exact verifier 与统一 UI/journal 尚未成为公共闭环。
7. 文件 V2 的 local provider etag 为空；未部署/未登记 managed directory 时不能假设可用。

### P2

8. `PageContentLoader` 无 `src/` 生产调用；已移除，其只读合同归入 `PageFileReader`，运行统一由 PageRuntimePool publication proof 链承接。
9. `src/` 无直接 batch CRUD/import 消费。
10. FieldCheckTag、FieldMention、DisplayPagination 当前已走统一数据链，不继续登记为缺口。

## 当前并行实施

- `publication-manifest`：发布 manifest、pagedata snapshot、兼容旧 VersionId。
- `save-recoverability`：派发前可恢复性证明、正式主键约束、capture identity。

## 退出规则

- 本轮任何服务缺口只阻断对应 owner/页面，不阻断其它底座任务。
- 不能新增本地第二套 HTTP/权限/保存链。
- 不能修改或启动 Java。
- `unknown` 不重发；无可证明主键的 Added 不派发。
- 真实实服、冷重开和下游读回未完成前，整体任务不结题。
