# 关系页过滤控件校验输出

状态：implementing；唯一总计划的关系编辑必要缺口。

只改 src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue、DataSpaceFilterEditor.props.ts、tests/runtime/page/design/data-space-filter-editor.test.ts，以及同目录 relation-filter-validation-result.md。不改四文件、宿主、API、通用 FilterExpressionEditor。无 commit/branch/online/额外代理。

完整读三文件和既有 codec 行为，增加 validation 事件，payload 具名 type 同 .props.ts 内：{contextKey:string,value:string|null|undefined,valid:boolean,message:string}。value 保留当前输入原值（区分 null/undefined/空串），valid 是现有 DataSpaceDesignApi.parseFilter 成功与否；message 成功为空串，失败为原解析错误。首次装载及 contextKey/value 变化时发出匹配当前 props 的校验结果；不要将合法上一次值的结论发给新上下文，不要复写父值，不改变已有 change/清空/取消/disabled 行为。校验可用于只读值，disabled 不代表 invalid；不另造 parser，不校验服务端函数可执行性。

页面 writer 接 onValidation 并核 context+value；未报告不允许保存。这是实际消费者，不导出全局校验 facade。首次实改后跑该 suite 的最小测试，冻结后该套+精确 ESLint 一次，报告覆盖的 malformed→valid、context 切换、原值不变、空值类型和实际事件。根 typecheck 由主控统一。结果落 relation-filter-validation-result.md，日志同目录。
