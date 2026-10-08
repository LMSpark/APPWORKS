# 关系新增主控审查

状态：关系新增通过限定本地验收，代码冻结；完整样板页和线上验收未完成。唯一 writer 为 fix_relation_lifecycle（gpt-6-sol medium），主控未并写生产文件。

## 当前依据与裁定

原页面语义、当前新增死支路和 DataSet 回执时序已在 relation-create-research.md 核实；精确实施范围和恢复出口见 relation-create-brief.md。DataView 接纳回执即清 pending，不能单靠 pending 表达后续关系回读/布局同步，因此复用 PageRuntime 命名文本草稿承载独立输入和流程记录，DataSet 保持唯一真实写入者。正式过滤表达式、按 ID 多关系与已存子模型数据权限边界不变。

## 已有本轮证据（2026-10-08）

- 11 份开工前原始字节副本在 relation-create-preimage/，主控逐份核 manifest SHA-256 均匹配。
- 新增命名本地草稿桥，跨同 runtime 的 PageContext 保留，修订冲突和旧 context 拒绝，dirty/明确清理有最小行为证据。主控发现 JS 参数可被 regex 隐式转换的问题，执行者补 name/content/revision 验证后通过；新增测试类型断言已改为 Reflect.apply。
- relation-create-bridge-green.log：1 passed、21 skipped，12:08:13 开始，执行者报告 exit 0，主控已读原始日志及实现。最早桥 red 仅留在工具执行记录，没有保存 red 日志，不能声称磁盘有该文件。
- relation-create-input-red.log / relation-create-input-green.log：独立输入打开/取消先红后绿，绿 1 passed、78 skipped，12:09:55 开始。主控已读绿日志及 script 接线：只写本地草稿，取消不 addRow、不发保存；该用例直接消费真实设计 fixture，不等于真实浏览器或完整表单点击验收。

## 最终验收（2026-10-08）

- 主控退回脚本手写选择框及借用 r-filter 的路线，最终父/子/关系类型等输入均为 rule.json 中现有 el-select-v2 配置；没有新增 Vue 页、私有 DataSet 或通用框架。将测试从直接发送组件事件改为真正点击下拉选项，核对未禁用和可选项，再填写完整 OR Filter、保存、正式回读、保存布局边及新 Runtime/Renderer 重开。
- 修复新增行导致全局正式快照校验失败、回读未核字段可见性、不可读 Join 归属、端点 Name 不唯一等具体问题；保持正式行校验和原 DataSet 保存责任。恢复只处理命令拥有的待提交字段，staging 的唯一候选可定位；丢弃暂存后重建页面，使输入确实可编辑或取消。请求中与回执后失效均有真实 Renderer 恢复用例，恢复不重发新增。
- 执行者最后实质修改为 12:37:27.318；主控核当前文件时间一致。随后 relation-create-final-tests.log 为 3 文件 175/175、EXIT=0，根类型和精确 lint 日志均 EXIT=0。主控已读原始日志；测试存在 jsdom requestSubmit 未实现提示，不作为真实浏览器证明。
- 主控独立执行 verify:pages-config、verify:ai-codegen（1003 文件）、verify:dirs 和本轮范围 git diff --check，退出码均 0。11 份预像再次全部核对 SHA-256；实际相对预像修改 9 文件，style.css 与 createSandbox.test.ts 未变。
- 有限本地结论：关系新增输入、保存、回读、图同步及中断恢复已通过本轮验收。数据来自正式协议夹具，未部署、未在线写入，不能据此宣称完整页面或线上零回归。主控保留总计划 implementing，后续继续同一整页缺口，不重派已验代码或重复不变的大套件。

具体命令、范围及证据索引见 relation-create-result.md。最早桥 red 只在工具输出；部分 *-red.log 后续运行被更新，不能把文件名当作保留了原始失败证据。知识候选保留本记录，不另写未经确认的 knowledge 或用户记忆。
