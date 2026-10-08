# 表达式目录恢复：全部父分支及祖先

状态：implementing；属于 notes/plan-appworks-four-file-integration.md 的同一完整设计页，不另起路线。用户已持续授权低阶实施、主控验收。本轮仅一名 writer，不再派子代理。

## 范围与基线

- config/pages/data-platform/data-space-design/script.js
- tests/runtime/page/design/data-space-design-four-file.test.ts
- 本目录 expression-context-result.md 与验证日志。

AGENTS.md 0.2—0.7 为产品原则。保留混合工作树，不建分支/提交/回退、不改后端或写在线数据。上轮已完成的关系保存、Join、布局、宿主 API 不返工。紧邻基线：relation-final-typecheck-recheck.log 类型通过、relation-page-fix-result.md 最终 52 项与精确 lint 通过。修改前完整读当前两目标源码及直接依赖，记录字节基线；其他文件必须先报主控真实缺口。

## 已核原语义与缺口

参考仓固定 SHA 842dec4f11b333df904b9a4e26b6566b0802bab8，只用 git show/git grep 读取：

- apps/appworks/src/ui/utils/graphLayout.ts 的 collectGraphAncestorIds / collectGraphAncestorIdsFromRelations：当前节点起点，全部父分支广度遍历，额外父 ID 优先入队；去重、环终止、排除当前自身。
- apps/appworks/src/ui/components/FilterBuilder/utils.ts 的 buildModelValueFunctionOptions：tables 为当前模型加祖先；relatedFields 仅祖先，引用值用注册 Name.字段 Name。
- data-set-management/design/ui/edge-panel/use-data-set-design-edge-panel.ts（按 git grep 定位准确前缀）：当前子模型 + 所有父祖先；当前编辑父端点作为额外祖先起点；systemParams/inputParams 为空间参数。过滤 LHS 字段仅子模型字段。
- 同目录 node-panel/use-data-set-design-node-panel.ts：模型请求过滤同样有全部祖先，空间参数供应两种命名空间；来源入参 ValueFun 的特殊模式不向 inputParams 提供同一来源输入。

当前页面 designValueFunctionContext 的 .find + while 只走一条父链；designModelFilterOptions 仅当前模型；designRelationFilterContext 仅父子两模型。三处可读字段投影重复且后两处未剔除 type=inputParams，造成目录不完整和元数据边界不一致。

## 设计裁定

1. 复用/收束本页内部模型与字段目录生成，参数至多 currentModelId、可选额外父 ID。不增加公共 API、第二状态、请求或运行时引擎。所有输入来自本次 designSnapshot 对应的正式 DataView。
2. 用模型 rowid 和关系 parentModId/childModId 遍历全部可读分支；校验数据空间和当前查询 owner。只以正式模型 Name 和字段 Name 生成引用，不以 MetaName、别名或字段相同猜关系。顺序当前模型、额外父、广度祖先；菱形共享祖先只出现一次，环/自环不重复当前模型。
3. 遵循当次 fieldAccess：模型 ID、所属空间、字段 ID/所属模型/type/Name/FieldType 等需可读；字段主键对应正式 getPkKey；inputParams 不作为模型数据字段。description/AsName 只在可读时作显示标签。隐藏/脱敏 Name 不输出；某一分支不可用不截断其他分支。可读关系身份允许沿 ID 继续遍历，遇隐藏模型 Name 不发布该模型的名字或字段，但不必删除其他可读祖先。禁止角色/admin 判断。
4. ValueFun 普通字段继续使用 inputParams，来源入参模式继续 systemParams 且不出现 inputParams 属性，保持已验合同。模型 Filter 和关系/JoinFilter 按原页恢复 tables + relatedFields + systemParams + inputParams。两过滤器的 LHS columns 仍仅当前/子模型输出字段。字段清单生成只保留一个 owner。
5. 不改表达式本身、保存校验、后端执行范围、布局或 model/viewCascades。不把祖先目录当多父字段输入级联。保存任意未知函数定义不等于前端可以求值。
6. 如遇实际可达同名正式模型/字段歧义，不能静默取第一项或凭别名修正；使用当前明确失败路径并报告证据，若需要新增 UI/公共合同先报主控。不要为假想冲突扩建诊断框架。

主控复审裁定：确已核实同名正式模型会生成歧义引用；固定源 node-panel:1482 的模型保存也拒绝同名。不要在 beforeRender 直接 throw，当前公共处理器会仅警告并继续使用默认 props。改用现有页面读取失败通道：在正式模型读完及重挂载快照恢复时，核验当前可读、非空的注册 Name 在目标空间唯一；重复时抛固定明确消息，并加入 reloadDesign 已有已知错误消息列表，让现有状态区显示且页面不进入 ready。隐藏/脱敏 Name 不读取、不拿来判重；空 Name 仍按目录不提供引用的既有行为，不新增空名全页禁用规则。两目标文件内补重复名字失败状态、零 mutation 和隐藏名不泄露用例，无新增 UI/配置。

## 验证与回报

先补当前会失败的多父/菱形祖先用例，执行最小测试留 red 日志；首次修复后立即验证该用例。优先扩充现有真实渲染来源参数/关系编辑夹具，避免重复整个宿主。

需证明：多父全部可选、共享祖先去重、环终止、无关模型不出现；隐藏/脱敏名字/描述不泄露、来源 inputParams 不是输出字段；关系/JoinFilter 与模型 Filter 也消费同一目录，LHS 不被祖先字段扩大；普通/来源入参两参数模式保持。至少一项从真实页面组件 props/操作验证；其余图反例可通过编译页公开函数/公共 DataView。不要私有 API 或 setupState，不用断言绕类型。

冻结后仅运行 pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts 及两目标文件的 ESLint --max-warnings=0。主控集中根类型和必要配置门禁；不重复已冻结 API/宿主/647+48 数据底座套件。记录文件、函数、测试准确数量、失败及修复、未覆盖边界。完成后冻结，按 EPSS 回报。
