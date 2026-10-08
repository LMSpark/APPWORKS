# 数据空间设计页只读闭环进度

状态：accepted-read-slice

主控2026-10-08 04:25签收本读取切片。独立86项通过，最后UI两点修正后再独立21项通过；typecheck/精确lint/pages-config及最终ai-codegen(985)/dirs/diff-check通过。六资产保存与正式文本回读见pilot-deploy-design-read-resume.json，后续rule/script修正见pilot-deploy-design-read-ui.json。首次rule回读误报已查明是PageTool的确定性序列化输出差异，不是丢失配置；必须对照owner.getFileText的实际提交文本。

在线pilot-design-read-online.json/png确认6模型、218字段（Name与AsName分列）、0关系、6节点0边、无参数；重新加载5次GetData+1次布局文本读取、0写接口/0HTTP错误。完整刷新、返回原目录query、再次点设计、复制API19行、1条完整查询绑定通过，console error为0。主控只读实际设计数据；上传仅工具/场景配置。M0/D2仍需画布及编辑/保存，未称整页或全量零回归。知识候选保留本报告，未自动写knowledge。

## 已完成的读取闭环

- 8D 设计页四文件及 90A 目录追加视图已经形成真实挂载草稿；目录新增设计动作校验当前 `Base_DataSet@catalog` view、主键、当前行和租户/应用路径，并传递场景及原始目录 fullPath。
- 设计页用真实 `LowcodeDataSpaceAssembler`、`DataSpaceRuntimeApi`、完整生产 pagedata 与 `SparkPageRenderer` 测试。全量 DataView 查询、跨页 501 字段、逐行身份/归属/关联校验、权限状态、请求 owner/revision、布局读取前门禁、布局/参数错误、返回路由均有覆盖。
- 已修复目录返回 query 保留及 pathname 编码检查、非法目标 ID 查询前拒绝、每次 await 后验证已捕获 DataView/rows/requestState，以及目标刷新后失效。读脚本不会写布局或其他业务数据。
- 最初 renderer tabs 节点身份问题已由主控依赖闭环修复并签收；隐藏普通列的 Element Plus prop fallback 泄漏也已由主控公共 FieldContextRenderer 依赖闭环修复并签收（证据：同目录 `pilot-hidden-cell-result.md`）。当前真实挂载能显示目标、模型、字段及布局信息。目录完整 suite 当前 65/65 通过。

## 已关闭的真实表格隐藏列泄漏 RED

命令：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts --reporter=dot`

历史结果：19 项中18项通过；唯一失败为 `keeps the page available when ordinary target and model display fields are hidden or masked`。该测试通过真实 `SparkPageRenderer` 和 Element Plus 表格挂载，未替换 DataView 或删改权限数据。主控修复公共渲染依赖后，该例已通过，并保持真实 DataView 权限行数据与 DOM 原值断言。

最小失败断言：`expect(wrapper.html()).not.toContain('目标空间')`。同一测试中正式权限消费结果已核实：

```text
targetView.fieldAccess(targetView.rows[0], 'Name').read === 'invisible'
modelView.fieldAccess(modelView.rows[1], 'MetaName').read === 'invisible'
```

依赖修复前，字段 `description` 的 masked 状态已在实际 DOM 正确投影为 `••••`，但隐藏列仍渲染后端原值。HTML 的目标名称 cell 精确片段为：

```html
<td ...><div class="cell"><!---->目标空间</div></td>
```

隐藏模型名 `隐藏模型名称` 也曾出现在模型表格 cell。页面列绑定 `Name` / `MetaName` 的 `r-text` 声明 readonly，可见性 API 返回 `invisible`。泄漏源头是隐藏 table slot 缺少默认 cell slot后 Element Plus `el-table-column` 回退显示 `prop`。该缺陷已在计划外 renderer 依赖闭环修复；本页没有扩大生产文件范围，也没有削弱断言。

## 当前验证

- `pnpm run typecheck`：通过（`vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json`）。
- 精确 ESLint：`pnpm exec eslint config/pages/data-platform/data-space-design/script.js config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts`，通过。
- `pnpm run verify:pages-config`：通过。
- `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts --reporter=dot`：21 passed。
- `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts --reporter=dot`：65 passed；包括新目录设计导航主键及 path/query 回归。
- 新增两种真实逐行owner权限回归：第一模型 `dataSetId` 可见，第二模型 `dataSetId` 分别 hidden/masked；均断言权限错误、0次布局读取，查询停在模型，不请求字段/关系。
- 页面真实挂载会调用provider布局读取一次、执行5个只读查询；没有CRUD写请求。本页已完成本地验证，等待主控线上签收。
- 按钮空文案闭环：最小RED命令 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t "reads the routed target"`，原断言实际得到 `['', '']`，预期 `['返回目录', '重新加载']`。RendererButton正式消费 `props.label`，字符串children被节点子项解析过滤；规则改为 `label` 后该真实SparkPageRenderer挂载用例GREEN，并点击“重新加载”验证只读请求从5增加到10、页面恢复ready且无runtime error。
- 按钮修正前子基线副本：`notes/evidence/sparkproject-appworks-integration/four-file-correction/pilot-design-read-page-button-label-before/rule.json`；其SHA-256为 `1FF6E3E4711CD3643CE8AAD5EB6347A87E4E315EF415AFFABDD57D0D341E2AE9`。
- 按钮修正复验：设计页suite 21/21、`pnpm run typecheck`、`pnpm run verify:pages-config`、上述精确ESLint命令均通过。未重复运行未变更的目录suite；未部署或写入业务数据。字段 `Name`/`AsName` 语义随后按计划04:17闭环，并记录如下。
- 字段名语义闭环（计划04:17）：最小真实挂载RED在 `Name=客户编号`、`AsName=''` 夹具下断言“字段名称”列出现“客户编号”，但原始字段页只请求/绑定 `AsName`，故DOM没有字段名。脚本字段查询追加正式 `Name`；规则将 `Name` 绑定“字段名称”，另将 `AsName` 绑定“规范别名”，无 raw 回退。GREEN断言两行真实数据：字段名有值且别名为空时仍展示字段名；另一行字段名与规范别名不同，分别显示“内部标识”和 `customer_id`。权限回归中一条字段Name为hidden、一条为masked，`fieldAccess`状态分别为invisible/masked，真实表格DOM均未包含对应原值。最终设计suite 21/21、typecheck、pages-config和精确ESLint通过。实施者未部署；线上字段页218行验证由主控更新rule/script后执行。

## 冻结文件指纹（SHA-256）

- `config/pages/data-platform/data-space-design/rule.json` — `1814E8DEF073CEA081899BDF1EC97DE09550BE84AD2FB606295EB91EE80DCCB8`
- `config/pages/data-platform/data-space-design/script.js` — `BE74BFAA7F105EB33AB9143EF2FB1F12180D262A21B7FB0B38BC43DE3978AA25`
- `config/pages/data-platform/data-space-design/style.css` — `0985063D20B1EE02362D844D9CAC3F5663401F0DE697EEBDE4B15207FB47049A`
- `config/pages/data-platform/data-space-design/pagedata.json` — `86CCF1CD4AE3B0A792FF91458074A691DD738955CE99BD21E65033267881A0C1`
- `config/pages/data-platform/data-space-catalog/pagedata.json` — `E7CABAA1868B5FC99478ABC1690FA99C1FA23AFE70BA910F1B1043F7B8A76A46`
- `config/pages/data-platform/data-space-catalog/script.js` — `5881450667E55D75D853DBD8FCCC83F3811C095A31A61964B8924C8C3E7FF855`
- `tests/runtime/page/design/data-space-design-four-file.test.ts` — `715AF1AC44AC6D0B4B866B261F581A3BA7B4592414CC91B80FDE8E831527177F`
- `tests/runtime/page/catalog/data-space-four-file.test.ts` — `889E0AB37518BA172BFAC3BE8E0246DB55D4FD5D7935BFC285A225B5DA84D159`

原有四个目标文件修改前副本保存在 `notes/evidence/sparkproject-appworks-integration/four-file-correction/design-read-page-before/`。实施者未提交或部署；主控已首次落地六资产，按钮及字段语义修正仍待主控更新rule/script后在线复验。本轮未写入业务数据。
