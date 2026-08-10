dm DocumentGovernance {
  schema: 1
  ver: "1.1.0"
  st: active
  dt: 2026-08-10
  locale: zh-CN
  owner: "SPARK View"

  purpose:
    "统一仓库文档分类、文件名、目录归属和自动化检测入口，避免 .md、.dm、README、专题文档混用后失去治理边界。"

  applies_to: [
    "*.md",
    "*.dm",
    "docs/**",
    "packages/**/README.md",
    "tools/**/README.md",
    "scripts/**/README.md",
    "backend-api-contracts/**/README.md"
  ]

  tool_gate:
    "pnpm run verify:docs"
}

section VersionRules {
  rule V01_dm_header_required {
    applies_to: "*.dm"
    required_fields: [
      "schema",
      "ver",
      "st",
      "dt"
    ]
  }

  rule V02_header_abbreviation {
    applies_to: "*.dm"
    rule:
      "维护字段使用短键：schema 表示 .dm 结构版本；ver 表示文档版本；st 表示状态；dt 表示最后语义更新时间。"
  }

  rule V03_schema {
    applies_to: "*.dm"
    rule:
      "schema 是整数；结构字段含义改变时递增。"
  }

  rule V04_ver {
    applies_to: "*.dm 和长期维护型 .md"
    rule:
      "ver 使用 SemVer。约束语义不兼容变更升 major；新增规则升 minor；文字修正升 patch。"
  }

  rule V05_st_values {
    applies_to: "*.dm"
    allowed: ["draft", "active", "deprecated", "archived"]
  }

  rule V06_version_update_method {
    applies_to: "修改 .dm"
    steps: [
      "更新 ver",
      "保留 dt 为最后语义更新时间",
      "如废弃，设置 st: deprecated 并补 replacement",
      "同步 README 或引用文档中的摘要",
      "运行 pnpm run verify:docs"
    ]
  }
}

section DocumentKinds {
  kind markdown {
    extension: ".md"
    purpose: "面向人阅读的说明、教程、架构说明、API 文档、README。"
    naming: "默认 kebab-case.md；系列文章可使用 NN-kebab-case.md。"
    examples: [
      "quickstart.md",
      "testing-best-practices.md",
      "01-spark-view-not-json-form-generator.md",
      "packages/spark-ai/src/module-semantic/MODULE-KIND-REGISTRATION.md"
    ]
  }

  kind domain_model {
    extension: ".dm"
    purpose: "领域模型、决策模型、注册面、治理规则、闭环模型；用于表达结构化事实和约束。"
    naming: "UPPER-KEBAB.dm；文件名只放主题词，类型由 .dm 承担，不重复写 DM。"
    examples: [
      "DOCUMENT-GOVERNANCE.dm"
    ]
  }

  kind standard_entry {
    extension: ".md"
    purpose: "目录入口、包入口、变更记录和公共约定。"
    allowed_names: [
      "AGENTS.md",
      "README.md",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "API.md",
      "ARCHITECTURE.md",
      "SKILL.md"
    ]
    locale_variant_rule:
      "README.<locale>.md 允许用于第三方或多语言包，例如 README.en.md、README.zh-TW.md、README.ja-JP.md。"
  }
}

section FilenameSignalRules {
  rule FN01_name_is_index_key {
    applies_to: "新增 .md/.dm"
    rule:
      "文件名是目录索引键，必须让读者一眼判断是否要打开；优先使用业务对象、协议对象、能力边界、动作域等主题词。"
  }

  rule FN02_no_filename_noise {
    applies_to: "新增 .md/.dm"
    deny_tokens: [
      "new",
      "old",
      "final",
      "latest",
      "draft",
      "wip",
      "temp",
      "copy",
      "backup",
      "misc",
      "notes",
      "info"
    ]
    rule:
      "这些词只表达维护状态，不表达主题；状态、版本和日期写入文件头或提交历史，不写入文件名。"
  }

  rule FN03_no_date_or_version_in_name {
    applies_to: "新增 .md/.dm"
    rule:
      "文件名不写日期、v1/v2、版本号、轮次。版本写 ver；更新时间写 dt；状态写 st；执行轮次写提交记录。"
  }

  rule FN04_domain_model_no_dm_prefix {
    applies_to: "新增 .dm"
    rule:
      ".dm 扩展名已经说明这是领域模型；文件名不再使用 DM- 前缀，把位置留给主题词。"
  }

  rule FN05_prefer_nouns_over_process_words {
    applies_to: "新增 .md/.dm"
    rule:
      "优先名词短语，不用 work、todo、update、change、refactor 这类过程词；除非过程本身就是主题。"
  }
}

section MarkdownFilenameRules {
  rule MD01_default_kebab_case {
    applies_to: "新增普通 .md 文档"
    allow: "^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\\.md$ 或 ^[a-z0-9]+(-[a-z0-9]+)*\\.md$"
    deny: [
      "大写字母",
      "下划线",
      "空格",
      "中文文件名",
      "日期随意拼接",
      "v1/v2/final/latest/draft 等状态词",
      "DM-*.md"
    ]
  }

  rule MD02_standard_singletons {
    applies_to: "目录入口和包公共文件"
    allow:
      "README.md、CHANGELOG.md、CONTRIBUTING.md、API.md、ARCHITECTURE.md"
  }

  rule MD03_locale_readme {
    applies_to: "多语言 README"
    allow:
      "README.<language>.md 或 README.<language>-<REGION>.md"
    examples: [
      "README.en.md",
      "README.zh-TW.md",
      "README.ja-JP.md"
    ]
  }

  rule MD04_no_new_upper_snake {
    applies_to: "新增 .md"
    rule:
      "不再新增 UPPER_SNAKE .md；必须优先使用 kebab-case，并把同主题文档收敛到现有 SSOT。"
  }

  rule MD05_no_new_dm_markdown {
    applies_to: "新增 DM 文档"
    rule:
      "结构化约束模型默认使用 .dm，不再新增 DM-*.md；源码邻近、面向阅读的注册面说明可以用明确登记的 .md，例如 MODULE-KIND-REGISTRATION.md。"
  }
}

section DirectoryRules {
  storage_decision_tree {
    question_1:
      "这是结构化规则、注册面、领域模型、闭环检查或治理模型吗？"
    yes_1:
      "写 *.dm。全仓规则放 docs/；贴近某个协议或源码边界的模型放到对应 packages/<package>/src/** 旁边。"

    question_2:
      "这是面向使用者的指南、教程或概念说明吗？"
    yes_2:
      "写 docs/guides/<kebab-case>.md 或 docs/<topic>/<kebab-case>.md。"

    question_3:
      "这是跨包架构或平台边界说明吗？"
    yes_3:
      "写 docs/architecture/<kebab-case>.md；若是硬约束模型，写 docs/<UPPER-KEBAB>.dm。"

    question_4:
      "这是某个包的入口说明、API、变更记录或包内架构吗？"
    yes_4:
      "写 packages/<package>/README.md、API.md、CHANGELOG.md 或 ARCHITECTURE.md。"

    question_5:
      "这是某个源码子目录的局部维护说明吗？"
    yes_5:
      "写该目录 README.md，只描述局部边界和维护注意事项。"
  }

  root_docs {
    path: "docs/"
    owns: [
      "跨包架构",
      "AI 平台边界",
      "使用指南",
      "全仓治理模型"
    ]
  }

  local_tooling_docs {
    paths: [
      "本地助手状态目录",
      "外部宿主配置目录",
      "发布工具目录"
    ]
    owns:
      "本地工具状态和外部宿主配置不属于仓库文档治理；需要时只在本机保留。"
    rule:
      "不要提交外部工具按固定路径读取的 agent、prompt、instruction 或发布流程文档。"
  }

  package_docs {
    path: "packages/<package>/"
    owns: [
      "包 README",
      "包 API",
      "包 ARCHITECTURE",
      "包 CHANGELOG"
    ]
    rule:
      "包内部文档只描述该包边界，不写跨包治理决策；跨包治理放 docs/ 或对应 .dm。"
  }

  source_local_docs {
    path: "packages/*/src/**/README.md"
    owns:
      "局部目录说明，只解释该目录公共入口和维护注意事项。"
    rule:
      "不承载全局架构决策。"
  }

  decision_models {
    path: "docs/*.dm、packages/<package>/src/**/*.dm，或明确登记的源码邻近注册面 .md"
    owns:
      "结构化约束、注册面、闭环检查、领域模型。"
    rule:
      "靠近真实消费代码优先；全仓通用规则放 docs/；面向人阅读的注册面可用 .md，但必须单独登记和检测。"
  }

  forbidden_locations {
    rules: [
      "不要在根目录新增普通专题 .md；根目录只保留入口级文件和历史 allowlist。",
      "不要在 docs/architecture 新增 DM-*.md；结构化 DM 必须是 .dm。",
      "不要在新增 .dm 文件名中重复 DM- 前缀。",
      "不要把跨包治理规则写进 packages/<package>/README.md。",
      "不要把包私有实现细节写进 docs/architecture；放包内或源码邻近 README。",
      "不要在生成产物目录、dist、node_modules 中维护手写文档。"
    ]
  }
}

section DirectoryRegistry {
  reg_ver: "1.1.0"
  update_rule:
    "新增文档目录前，必须先在本节登记 owner、purpose、index、allowed_files，并同步 tools/verify-docs.mjs 的 registeredDocPrefixes。"

  entry root {
    path: "."
    owner: "repo"
    purpose: "仓库入口和顶层约定。"
    index: "README.md"
    allowed_files: ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", "AGENTS.md"]
    new_file_rule: "不再新增普通专题文档到根目录。"
  }

  entry ai_coding_kit {
    path: "ai-coding-kit/"
    owner: "docs"
    purpose: "可移植 AI 编码标准模板。"
    index: "ai-coding-kit/AGENTS.md"
    allowed_files: ["AGENTS.md"]
    new_file_rule: "只维护可移植标准入口；项目特有规范留在 AGENTS.md。"
  }

  entry config {
    path: "config/"
    owner: "app"
    purpose: "仓库级手写配置说明与 JSON Schema 协议索引。"
    index: "config/README.md"
    allowed_files: ["README.md"]
    new_file_rule: "配置数据用 JSON；说明文档只放 README，专题治理文档迁移到 docs/。"
  }

  entry docs {
    path: "docs/"
    owner: "docs"
    purpose: "全仓文档入口和跨包治理。"
    index: "docs/README.md"
    allowed_files: ["README.md", "*.dm", "kebab-case.md", "legacy UPPER_SNAKE allowlist"]
  }

  entry docs_architecture {
    path: "docs/architecture/"
    owner: "architecture"
    purpose: "当前仍然成立的跨包架构事实和边界。"
    index: "docs/architecture/README.md"
    allowed_files: ["README.md", "kebab-case.md", "legacy UPPER_SNAKE allowlist"]
    new_file_rule: "新的结构化决策模型写 docs/<UPPER-KEBAB>.dm，不写 docs/architecture/DM-*.md。"
  }

  entry docs_guides {
    path: "docs/guides/"
    owner: "docs"
    purpose: "当前可执行的用户指南、接入指南和操作教程。"
    index: "docs/guides/README.md"
    allowed_files: ["README.md", "kebab-case.md", "legacy UPPER_SNAKE allowlist"]
  }

  entry knowledge {
    path: "knowledge/"
    owner: "ai"
    purpose: "AI 编码助手的长期踩坑记录和领域知识索引。"
    index: "knowledge/README.md"
    allowed_files: ["README.md", "kebab-case.md"]
    new_file_rule: "只沉淀可复用规则；一次性任务记录放 notes/。"
  }

  entry notes {
    path: "notes/"
    owner: "ai"
    purpose: "AI 代码修改协议的持久层工作记录、方案和度量日志。"
    index: null
    allowed_files: ["kebab-case.md"]
    new_file_rule: "文件名不带日期；日期写入正文或元数据。"
  }

  entry packages {
    path: "packages/"
    owner: "package-owners"
    purpose: "workspace 包索引和包内文档。"
    index: "packages/README.md"
    allowed_files: ["README.md", "<package>/README.md", "<package>/API.md", "<package>/ARCHITECTURE.md", "<package>/CHANGELOG.md", "<package>/src/**/README.md", "<package>/src/**/*.dm", "registered source-local UPPER-KEBAB.md"]
  }

  entry scripts {
    path: "scripts/"
    owner: "tooling"
    purpose: "脚本目录说明。"
    index: "scripts/README.md"
    allowed_files: ["README.md"]
  }

  entry tools {
    path: "tools/"
    owner: "tooling"
    purpose: "治理和辅助工具说明。"
    index: "tools/README.md"
    allowed_files: ["README.md"]
  }

  entry tests {
    path: "tests/"
    owner: "qa"
    purpose: "测试目录说明。"
    index: "tests/README.md"
    allowed_files: ["README.md"]
  }

  entry src {
    path: "src/"
    owner: "app"
    purpose: "应用源码局部目录说明。"
    index: "src/README.md"
    allowed_files: ["README.md", "**/README.md"]
  }

  entry backend_api_contracts {
    path: "backend-api-contracts/"
    owner: "api-characterization"
    purpose: "lowcode 旧端点账本、行为 characterization 与只读迁移证据。"
    index: "backend-api-contracts/README.md"
    allowed_files: ["README.md", "characterization-fixtures/**/README.md"]
  }

  entry plans {
    path: "plans/"
    owner: "planning"
    purpose: "短期迁移计划和历史执行计划。"
    index: null
    allowed_files: ["kebab-case.md"]
    new_file_rule: "长期规则不得放 plans/；完成后迁移到 docs/ 或删除。"
  }

  entry public {
    path: "public/"
    owner: "frontend"
    purpose: "静态资源说明。"
    index: "public/README.md"
    allowed_files: ["README.md"]
  }

}

section LegacyMarkdownAllowlistPolicy {
  reason:
    "仓库已有大量 UPPER_SNAKE .md 和 DM-*.md，直接重命名会破坏链接和历史引用。"

  policy: [
    "现有不合规 .md 进入 verify-docs allowlist",
    "allowlist 只允许减少，不允许新增同类债务",
    "后续迁移必须同时修复所有引用链接",
    "迁移完成后从 tools/verify-docs.mjs allowlist 删除对应路径"
  ]
}

section UpdateRules {
  rule U01_code_change_updates_nearest_doc {
    applies_to:
      "代码改动改变公开入口、注册面、配置协议、构建链路或用户操作方式。"
    action:
      "同一提交更新最近的 README/API/ARCHITECTURE 或对应 .dm。"
  }

  rule U02_dm_is_constraint_source {
    applies_to:
      ".dm 与 .md 同时描述同一约束。"
    action:
      ".dm 是结构化约束真源；.md 只做解释和入口链接。修改约束时先改 .dm，再同步 .md 摘要。"
  }

  rule U03_filename_change_requires_reference_update {
    applies_to:
      "重命名或移动任意 .md/.dm。"
    action: [
      "用 rg 搜旧路径和旧文件名",
      "更新所有相对链接、README 索引和脚本引用",
      "运行 pnpm run verify:docs",
      "如是历史 allowlist 文件，删除或更新 tools/verify-docs.mjs 中对应项"
    ]
  }

  rule U04_no_silent_doc_fork {
    applies_to:
      "新增文档与已有文档主题重叠。"
    action:
      "优先更新已有文档；只有确实需要新主题边界时才新增，并在旧文档加跳转或索引。"
  }

  rule U05_deprecate_before_delete {
    applies_to:
      "删除长期存在或被链接的文档。"
    action: [
      "先在原文档顶部标注 st: deprecated 和 replacement",
      "迁移引用",
      "下一次清理提交再删除文件",
      "删除后运行 verify:docs 确认 allowlist 和链接入口已收敛"
    ]
  }

  rule U06_generated_docs_mark_source {
    applies_to:
      "生成型文档或由脚本维护的文档。"
    action:
      "必须在文件头说明生成来源和更新命令；手写文档不得伪装成生成产物。"
  }
}

section NamingExamples {
  markdown_good: [
    "docs/guides/testing-best-practices.md",
    "packages/spark-ai/ARCHITECTURE.md",
    "packages/spark-data/API.md",
    "packages/spark-component/API.md",
    "packages/spark-ai/src/module-semantic/MODULE-KIND-REGISTRATION.md"
  ]

  markdown_bad_for_new_files: [
    "packages/spark-ai/docs/SPARK_AI_NEW_TOPIC.md",
    "docs/architecture/DM-OLD-RULE-2026-05-23.md",
    "docs/SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md",
    "packages/spark-utils/REQUEST_GUIDE.md"
  ]

  domain_model_good: [
    "docs/DOCUMENT-GOVERNANCE.dm"
  ]

  domain_model_bad: [
    "docs/architecture/DM-NEW-RULE.md",
    "docs/DM-DOC-GOVERNANCE.dm",
    "docs/dm-doc-governance.dm",
    "docs/MODULE-KIND-REGISTRATION-2026-05-23.dm",
    "docs/MODULE-KIND-REGISTRATION-V2.dm"
  ]
}

section Automation {
  script:
    "tools/verify-docs.mjs"

  package_script:
    "verify:docs"

  default_gate:
    "verify:rules = verify:arch && verify:ai-codegen && verify:docs"

  checks: [
    "扫描 .md 文件名",
    "扫描 .dm 文件名",
    "扫描文件名是否含日期、版本、状态词或重复类型词",
    "扫描 .dm 版本头",
    "扫描文档目录是否已登记",
    "阻止新增 DM-*.md",
    "阻止新增 UPPER_SNAKE .md",
    "保留历史 allowlist"
  ]
}
