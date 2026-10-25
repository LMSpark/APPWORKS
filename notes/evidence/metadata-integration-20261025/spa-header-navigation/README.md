# SPA 顶栏导航验收证据

基线为 `1f888531293a8677533173dfde97a243e5934acb`。本目录是冻结证据，不是第二份活动计划；唯一状态记录为仓内 `notes/data-space-retirement-ledger.md`。报告和日志中的缓存路径、历史建议、脚本及旧 hash 保留原语境，不是可直接重放的操作指令。

## 最终结果

- 产品仅 AppHeader/NavHeaderBar 两文件，使用已安装 Element Plus 横向菜单溢出能力，原 items/useNav、SPA 导航和数据链保持同一责任方；另加一个组件测试文件。
- 主控最终组合测试 44/44；typecheck、完整 lint、正式生成、verify:rules、build 均 exit 0。原始 warning 保留，不声明零告警。
- 独立复审发现 3 项 P2，经原单写者 round 1 修复后均 ADDRESSED；最终源码 hash 见 delivery audit。原始失败包含测试定位及样式夹具错误，报告明确区分，不能全部当作产品反例。
- 1280、1024（侧栏展开）和 2300（侧栏收起）中，14 个入口均由主栏或更多菜单触达，header 仍 48px。默认视口已恢复；最终保留数据字典工作区。
- 有效网络窗口仅涵盖重新绑定 tab5 观察器后的正式字典刷新、首末模块切换及已有字典标签返回。1 个 GetData 返回 HTTP/Code 200、Count 353、Items 20；0 Document、0 非查询请求、0 截断。旧观察器空事件窗口不作为零请求证据。

## 阅读入口

- `nav-header-delivery-audit.json`：门禁、最终源码指纹、布局和有效网络断言。
- `nav-header-spa-evidence.json`：逐步 DOM 几何及观察边界。
- `nav-header-1280-final.png`：默认视口最终导航和字典页。
- `nav-header-overflow-rereview.md`：原发现与逐项复审。归档文件名按文档规则改为具体主题词，内容保持原始字节。
- `nav-header-generated-audit.json`：16 份正式生成差异；12 份仅编译器符号编号，其余为两个壳模块元信息及清单。两组件有模块产物，但 models/symbols 为空，没有新增公开属性合同。
- `b2-database-current-contract.md`：仅只读研究。同步 POST 符合所读 controller 推荐映射，当前部署未验；字段注释修改也可能触发 DDL。本组没有注册、同步、设计保存或 Java 改动。

## 限制和遗留项

当前正式菜单无 parent/flat 子菜单或 dividerAfter 配置，嵌套样式和分隔线仅有组件语义测试及源码复核，不声称已经真实浏览器验证伪元素。仅验证上述三档桌面宽度。

导航目标分别暴露已有差距：SPARK 工具默认页仍占位；入驻管理页面未注册；数据编码缺正式 `_Base_CodeDesign` 模型。入口触达不证明这些业务页已完成。本组没有后台业务保存或删除，保留的 B1 字典、7 条条目、旧 AI 未知轮次与未知创建进程未清理。

`manifest.json` 记录本目录其余文件的原始字节 SHA-256；本目录限定的 gitattributes 保留原始证据字节，不影响产品文件的格式检查。
