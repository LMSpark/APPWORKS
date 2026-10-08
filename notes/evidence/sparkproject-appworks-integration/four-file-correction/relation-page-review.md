# 关系页面主控进度与验收

状态：implementing；不代表完整样板验收。

## 09:36 本轮验收结论

已存关系的过滤式编辑、Join 编辑/清空、按 ID 删除及其布局维护，本轮限定链路通过本地验收；新增与完整页面仍未完成。09:25 拒收的三项生命周期缺陷已按 relation-page-fix-result.md 修正，随后发现的私有 DataView 方法调用也已从页面和测试移除，未放宽 DataView 公共合同。

- 最终 design 四文件测试 52/52（09:34:44，relation-page-fix-full.log），覆盖真实页面 Join 下拉与保存、完整过滤条件回读、delete-only 权限、同批清 Join、共享/其他父归属保留、提交前精确恢复、保留其他草稿及提交后 unknown 锁。源码和测试最后修改均早于该套件。精确两文件 ESLint exit 0。
- 主控根类型最终 exit 0（relation-final-typecheck-recheck.log）；pages-config、ai-codegen（1002 文件）、dirs exit 0，各 relation-final-*.log。前次类型失败日志保留；没有通过新增断言或放宽公共接口绕检查。
- 宿主/API 与过滤控件保留其冻结后验证：API 62、宿主/生命周期 40、sandbox 25、目录 65、过滤校验 9；包类型/精确 lint 通过。不重复旧关系底座 647+48。该记录不表示浏览器或在线数据验收；本轮无在线写入。
- 全部 writer 已冻结。下轮从下方“整页后续核对点”续接：完整多分支祖先函数目录；新增权限仍待已发问题的答复。不要重派已验收闭环，也不要把仍缺来源创建、图编辑/预览、输入多父级联等完整页能力标完成。

## 当前派工与裁定

- implement_relation_page：唯一四文件与页面测试 writer；读 relation-page-brief.md。已存关系编辑/删除、Join、多视图保存、回读及布局维护继续实施。
- restore_model_forms：唯一关系宿主/API writer；读 relation-host-brief.md。依赖字典专用 read、已存在布局独立 writer，拒绝猜场景或第二保存协议。
- reuse_filter_editor：过滤校验事件已冻结；9 项控件测试通过（relation-filter-validation-suite.log，09:01:35），3 路径 ESLint exit 0。主控已读 Vue/props 和新增测试、核文件时间早于日志。根类型和页面接线待统一验收。
- Join 归属裁定：当前父模型等于子模型 PId 或 PId 为空才允许维护 Join；其他父关系的操作保留已有 Join。模型关系仍支持多父/多条，按 rowid 定位。
- 布局 writer 仅维护已有合法原文 expectedContent:string；缺失重建不属于自动关系保存。写前比对、复用上传 owner 字节回读，不承诺 CAS；元数据与图文件分别确认。

## 新增草稿权限的真实未决项

主控核读 DataSpaceQueryContext.prepareNewRow/fieldAccess：新增主键由原查询 owner 生成，但 fieldAccess 只索引已返回行，新主键为 denied。DataView.addRow 能 stage 新行，字段组件因此没有新行字段输入许可。不能借已有行、首行、账号或造权限对象。

后端只读核对：E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java:1482-1493 的 GetData 返回 allowAdd/primaryKeyField/table token，没有新草稿字段授权。lowcode-framework/lowcode-anyline/src/main/java/com/htong/config/permission/DataPermissionAspect.java:1105-1151 的 handleAdd 核表新增许可、必填及保存条件；不按已有行 E 字段名单授权新草稿。docs/architecture/PERMISSION_SYSTEM.md:17/29 明确 allowAdd 不授予草稿字段权限。当前没有可安全推出的前端新行字段授权。

已发起单一产品边界问题：是否新增按 allowAdd 开放已声明输入、后端最终校验；或另补正式新草稿授权合同。尚未收到答复前，不实施依赖该决策的新增输入逻辑；已有关系路径不停止。总范围仍含新增，不能据此删需求或把关系页标完成。

## 09:13 主控审查与返修

- 宿主 writer 已冻结：报告 relation-host-result.md；API 62、宿主/生命周期 40、sandbox 25，包级类型及精确 lint 已通过。主控已审查窄 API、PageContext 与布局上传调用链；根级验收待页面冻结。未在线写入。
- 删除布局未执行的根因由主控核源码确定：页面用 savedCount（更新数量）判断删除成功；实际 DataSet 分别累计 createdCount/savedCount/deletedCount。返修要求按每个 viewResults 的 tableName/viewId 和实际操作核回执，不能修改 fixture 计数掩盖错误。
- Join 只校验 JoinType/ForeignKeyFields/JoinFilter 三个输入全空或全填，再派生 PId=父注册 Name 或空；不能把派生 PId 当必须用户先填写的第四项。删除最后一条父子关系时，若 PId 属于当前父，清四字段并同批保存；其他父归属保留。同父子仍有其他正式关系时，PId 无法证明单条独占，保留共享 Join。
- 模型保存回读必须保留原完整设计投影，不能用 Join 的窄列查询替换整个 designModels，造成其他表单列丢失。
- 只有删除权限的关系须有删除入口；外键选项 label 不得读取隐藏 description；结果未知锁不能通过取消/重选直接清除。
- 最小真实页面 edit/delete 已通过（执行者 1 passed / 45 skipped）。主控要求按最终图语义和精确写入次数验收，移除调试阶段的读取恰好一次断言，因为结果重建合法地再次读取布局。
- 根级类型首验失败已收敛为 PageContext 夹具传播及页面测试新增类型错误；目录夹具修正后 65 项及 lint 通过，原始日志 relation-host-catalog-check.log。design 夹具由页面 writer 修正后再验根类型。

## 整页后续核对点（未作已通过结论）

固定源关系表达式函数目录包含当前子模型及所有关系祖先。当前新关系函数目录只列当前父/子，既有 designValueFunctionContext 也只沿第一个父链遍历。须在整页语义复核时恢复多分支祖先，复用可读字段投影并处理环，不能将此现状冒充完整关系编辑能力；与输入多父级联仍是不同层。

## 验证执行

09:25 该页面实现未签收。主控从源码核实：正常 Join 草稿被 hasEditingChanges 一概拒绝；暂存后用 discardEditingRows 无法清 pending；删除校验拒绝时 clearJoin 意图分支可能丢弃原先存在的其他草稿。原报告对此的已完成措辞证据不足，由 relation-page-fix-brief.md 定向返修并补反例。使用一名更适合多状态修复的低阶实现者，避免继续无覆盖地重复修代码。

根类型开工基线 relation-page-typecheck-baseline.log 通过。每 writer 首改最小验证，冻结后再集中本页/宿主/类型/精确 lint/门禁；不重复上一轮未变化的 647+48 关系底座检查。所有 partial/unknown/读回不符均保留状态，不声称回滚或零回归。
