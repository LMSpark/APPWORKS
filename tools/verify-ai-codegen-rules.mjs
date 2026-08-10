#!/usr/bin/env node

import process from 'node:process'
import ts from 'typescript'
import {
  collectModuleReferences,
  collectSourceFiles,
  createDefaultExcluder,
  forEachParsedSource,
  isCliEntrypoint,
  lineFor,
  parseCliArgs,
  printViolations,
} from './verifier-common.mjs'

const includeRoots = ['packages', 'src', 'tests', 'tools']
const includeFiles = [
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.spark-ai.config.ts',
]

const interfaceAllowlist = new Set([
  'packages/spark-utils/src/capability/core.ts:CapabilityTypeMap',
  'packages/spark-component/src/page/services/app-services.ts:CapabilityTypeMap',
  'packages/spark-component/src/runtime/app-services.ts:CapabilityTypeMap',
  'packages/spark-component/src/core/capability-keys.ts:CapabilityTypeMap',
  // Host session-types 与 transport-types 是完整类型契约模块；
  // 按主题再次 re-export 会制造额外间接层。
  'packages/spark-ai/src/agent/index.ts:./session/session-types',
  'packages/spark-ai/src/index.ts:./agent/session/session-types',
  'packages/spark-ai/src/agent/index.ts:./transport/transport-types',
  'packages/spark-ai/src/index.ts:./agent/transport/transport-types',
])

const allowedSparkAiSpecifiers = new Set([
  '@spark-appworks/spark-ai',
  '@spark-appworks/spark-ai/agent',
  '@spark-appworks/spark-ai/class-model',
])

const removedAgentNamespaceName = ['Ai', 'Module'].join('')
const removedPathIdentity = ['$', 'paths'].join('')
const removedCompanionOption = ['companion', 'Modules'].join('')

const forbiddenRemovedAgentNamespaceMembers = new Set([
  'ActionFailureMode',
  'ActionMetadata',
  'ActionResultSchema',
  'ActionSchema',
  'AttributeAccess',
  'AttributeMetadata',
  'AttributeSchema',
  'CheckEntry',
  'ChildrenLister',
  'HostContext',
  'InstanceFinder',
  'InstanceQuery',
  'InstanceRef',
  'KindOperation',
  'Options',
  'OperationResult',
  'OperationResultOptions',
  'PathContext',
  'Runner',
])

const forbiddenRemovedAiTypeIdentifiers = new Set([
  'ActionSchema',
  'AttributeSchema',
  'JsonSchemaProperties',
  'LlmParameterSchemaRoot',
  'ModuleModuleAction',
])

const maxNamedImportsPerWorkspaceModule = 8
const maxPublicSurfaceExportsPerModule = 8
const maxLayeringExportsPerModule = 3
const maxDefaultPositionalSignatureParams = 3
const maxConstructorParameterPropertyParams = 4

const publicSurfaceAllowlist = new Set([
  // Schema 构造器会成对暴露值构造器与 Options 类型：
  // Options 名称能让公共函数签名保持简短，同时不隐藏契约。
  'packages/spark-ai/src/index.ts:./json',
  // Agent 与 ClassModel 协议聚合出口是允许 @spark-appworks/spark-ai subpath 背后的显式公共门面。
  'packages/spark-ai/src/agent/index.ts:./business/ai-host',
  'packages/spark-ai/src/agent/index.ts:./business/business-kit',
  'packages/spark-ai/src/agent/index.ts:./workflow',
  'packages/spark-ai/src/agent/workflow/index.ts:./agent-workflow-definition',
  'packages/spark-ai/src/agent/workflow/index.ts:./agent-workflow-dry-run',
  'packages/spark-ai/src/agent/index.ts:./tool-runtime',
  'packages/spark-ai/src/agent/index.ts:./native-runtime',
  'packages/spark-ai/src/agent/tool-runtime/index.ts:./tool-runtime-types',
  'packages/spark-ai/src/class-model/index.ts:./class-model',
  'packages/spark-ai/src/class-model/index.ts:./metadata',
  'packages/spark-ai/src/class-model/index.ts:./knowledge',
  'packages/spark-ai/src/class-model/index.ts:./projection',
  'packages/spark-ai/src/class-model/index.ts:./runtime',
  'packages/spark-ai/src/class-model/class-model/index.ts:./types',
  'packages/spark-ai/src/class-model/knowledge/index.ts:../projection',
  'packages/spark-ai/src/class-model/metadata/index.ts:./ai-api-object-metadata-schema',
  'packages/spark-ai/src/class-model/projection/index.ts:./dts-renderer',
  'packages/spark-ai/src/class-model/runtime/index.ts:./class-model-runtime',
  'packages/spark-project-model/src/index.ts:./project/project-types',
  'packages/spark-project-model/src/index.ts:./blueprint/project-blueprint-node',
  'packages/spark-project-model/src/index.ts:./blueprint/project-blueprint-tree',
  // Host session-types 与 transport-types 是完整类型契约模块；
  // 按主题再次 re-export 会制造额外间接层。
  'packages/spark-ai/src/agent/index.ts:./session/session-types',
  'packages/spark-ai/src/index.ts:./agent/session/session-types',
  'packages/spark-ai/src/agent/index.ts:./transport/transport-types',
  'packages/spark-ai/src/index.ts:./agent/transport/transport-types',
])

const publicClassMethodSurfaces = new Map([
  ['packages/spark-ai/src/class-model/runtime/class-model-runtime.ts:ClassModelRuntime', new Set([
    'getTools',
    'executeTool',
  ])],
])

const layeringExportSuffixPattern = /(?:Provider|Resolver|Adapter|Factory|Context|Options|Interface|Impl)$/u
const mechanicalNameSuffixPattern = /(?:Interface|Impl)$/u
const repeatedRoleTypeSuffixPattern = /(?:Context|Options|Provider|Resolver|Adapter|Factory|Interface|Impl)$/u
const multiWordTypeNamePattern = /[a-z][A-Z]/u

export function scanAiCodegenRules(options = {}) {
  const root = options.root ?? process.cwd()
  const files = collectSourceFiles({
    root,
    includeRoots: options.includeRoots ?? includeRoots,
    includeFiles: options.includeFiles ?? includeFiles,
    exclude: createDefaultExcluder(root),
  })
  const violations = []

  for (const filePath of files) {
    forEachParsedSource(filePath, root, (parsed) => {
      scanSource(parsed, violations)
    })
  }

  return { files, violations }
}

export function runAiCodegenCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd(), includeRoots, includeFiles })
  if (args.help) {
    console.info('Usage: node tools/verify-ai-codegen-rules.mjs [--root DIR] [--include-root DIR] [--include-file FILE]')
    return 0
  }

  const { files, violations } = scanAiCodegenRules(args)
  if (violations.length > 0) {
    printViolations('AI codegen rule scan failed', violations)
    return 1
  }

  console.info(`AI codegen rule scan passed: ${files.length} file(s) checked.`)
  return 0
}

function scanSource(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed

  scanNamedImportConvergence(parsed, violations)
  scanPublicSurfaceConvergence(parsed, violations)
  scanPublicClassMethodSurfaces(parsed, violations)
  scanSignatureConventions(parsed, violations)
  scanRemovedProtocolLiterals(parsed, violations)
  scanBusinessRegistrationRules(parsed, violations)

  for (const ref of collectModuleReferences(sourceFile)) {
    if (isForbiddenSparkAiSpecifier(ref.specifier)) {
      violations.push({
        file,
        line: lineFor(sourceFile, ref.node, lineOffset),
        message: `forbidden @spark-appworks/spark-ai subpath: ${ref.specifier}`,
      })
    }
  }

  function visit(node) {
    if (!isTestFile(file) && ts.isAsExpression(node)) {
      const typeText = node.type.getText(sourceFile)
      if (typeText !== 'const') {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `type assertion is forbidden: ${node.getText(sourceFile).replace(/\s+/gu, ' ').slice(0, 160)}`,
        })
      }
    }

    if (!isTestFile(file) && ts.isTypeAssertionExpression(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `angle-bracket type assertion is forbidden: ${node.getText(sourceFile).replace(/\s+/gu, ' ').slice(0, 160)}`,
      })
    }

    if (ts.isInterfaceDeclaration(node)) {
      const key = `${file}:${node.name.text}`
      if (!interfaceAllowlist.has(key)) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `interface declaration is forbidden outside allowlist: ${node.name.text}`,
        })
      }
    }

    if (isForbiddenNamespaceDeclaration(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `TypeScript namespace declaration is forbidden: ${node.name.getText(sourceFile)}`,
      })
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && node.exportClause === undefined) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: 'export * is forbidden; public surfaces must use explicit export lists',
      })
    }

    if (isForbiddenRemovedAgentNamespaceAccess(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `removed agent namespace member is forbidden: ${node.getText(sourceFile)}`,
      })
    }

    if (ts.isIdentifier(node) && forbiddenRemovedAiTypeIdentifiers.has(node.text)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `removed AI type name is forbidden: ${node.text}`,
      })
    }

    if (hasMechanicalDeclarationName(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `mechanical Interface/Impl name is forbidden: ${node.name.text}`,
      })
    }

    if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && isMechanicalName(node.name.text)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `mechanical Interface/Impl import/export is forbidden: ${node.name.text}`,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanRemovedProtocolLiterals(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text
      if (
        text === removedPathIdentity
        || text.includes(`"${removedPathIdentity}"`)
        || text.includes(`'${removedPathIdentity}'`)
      ) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: 'removed protocol identity is forbidden; use module path plus session scope',
        })
      }
      if (looksLikeDynamicFunctionToolName(text)) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `removed dynamic function tool name is forbidden: ${text}`,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanBusinessRegistrationRules(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (!file.replace(/\\/gu, '/').includes('src/services/')) return
  const text = sourceFile.getFullText()

  if (/\bcreateAiBusinessKit\b/u.test(text)) {
    violations.push({
      file,
      line: 1,
      message: 'createAiBusinessKit is removed; register business AI through AgentWorkflowDefinition activation bindings',
    })
  }

  if (/\bcreateAiAgentRegistration\b/u.test(text)) {
    violations.push({
      file,
      line: 1,
      message: 'createAiAgentRegistration is forbidden in src/services; use AgentWorkflowDefinition activation bindings with ClassModelAgentAdapter.createRegistration providers',
    })
  }

  if (new RegExp(`\\bnew\\s+${removedAgentNamespaceName}\\s*\\(`, 'u').test(text)) {
    violations.push({
      file,
      line: 1,
      message: 'manual removed agent module construction is forbidden in src/services; use AgentWorkflowDefinition activation bindings + DTS ClassModel',
    })
  }

  if (new RegExp(`\\b${removedCompanionOption}\\b`, 'u').test(text)) {
    violations.push({
      file,
      line: 1,
      message: 'removed companion module option is forbidden; do not inject handwritten business modules',
    })
  }

  const removedCatalogModuleOption = ['payload', 'Catalog', 'Modules'].join('')
  if (new RegExp(`\\b${removedCatalogModuleOption}\\b`, 'u').test(text)) {
    violations.push({
      file,
      line: 1,
      message: 'removed catalog-module injection option is forbidden; expose complex arguments through DTS ClassModel and JSON Schema',
    })
  }

  const removedIdentifiers = [
    ['query', 'Payloads'].join(''),
    ['guide', 'Payload'].join(''),
    ['create', 'Payload', 'Catalog', 'Module'].join(''),
    ['create', 'Spark', 'Component', 'Catalog', 'Provider'].join(''),
    ['upload', 'component', 'metadata'].join('-'),
  ]

  for (const removedIdentifier of removedIdentifiers) {
    if (new RegExp(`\\b${removedIdentifier}\\b`, 'u').test(text)) {
      violations.push({
        file,
        line: 1,
        message: `${removedIdentifier} is removed; use model_action_guide and model_script instead`,
      })
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile)
      const method = node.expression.name.text
      if (receiver === 'runtime' && method === 'register') {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: 'manual removed agent runtime register is forbidden in src/services; use AgentWorkflowDefinition activation bindings',
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function looksLikeDynamicFunctionToolName(value) {
  return /^[a-z][a-z0-9-]*_[a-z][a-z0-9-]*_(?:[A-Z][A-Za-z0-9]*|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)$/u.test(value)
}

function scanNamedImportConvergence(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  const importsByModule = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue

    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('@spark-appworks/')) continue

    const key = `${file}:${specifier}`
    let entry = importsByModule.get(key)
    if (entry === undefined) {
      entry = { specifier, names: new Set(), node: statement }
      importsByModule.set(key, entry)
    }

    for (const element of statement.importClause.namedBindings.elements) {
      entry.names.add((element.propertyName ?? element.name).text)
    }
  }

  for (const [key, entry] of importsByModule) {
    const count = entry.names.size
    if (count <= maxNamedImportsPerWorkspaceModule) continue

    violations.push({
      file,
      line: lineFor(sourceFile, entry.node, lineOffset),
      message: `too many named imports from ${entry.specifier}: ${count}; use a module facade or main object instead of a flat import list`,
    })
  }
}

function scanPublicSurfaceConvergence(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (!isProtocolPublicSurfaceFile(file)) return

  const exportsByModule = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue

    const specifier = statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : '<local>'
    const key = `${file}:${specifier}`
    let entry = exportsByModule.get(key)
    if (entry === undefined) {
      entry = { specifier, names: new Set(), layeringNames: new Set(), node: statement }
      exportsByModule.set(key, entry)
    }

    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text
      entry.names.add(exportedName)
      if (isLayeringExportName(exportedName)) {
        entry.layeringNames.add(exportedName)
      }
    }
  }

  for (const [key, entry] of exportsByModule) {
    if (publicSurfaceAllowlist.has(key)) continue

    const nameCount = entry.names.size
    const layeringCount = entry.layeringNames.size
    const exceedsThreshold = nameCount > maxPublicSurfaceExportsPerModule
      || layeringCount > maxLayeringExportsPerModule

    if (!exceedsThreshold) continue

    violations.push({
      file,
      line: lineFor(sourceFile, entry.node, lineOffset),
      message: `flat public surface from ${entry.specifier}: ${nameCount} export(s), ${layeringCount} Provider/Resolver/Adapter/Factory/Context/Options export(s); expose a smaller facade or main object`,
    })
  }
}

function scanPublicClassMethodSurfaces(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      const key = `${file}:${node.name.text}`
      const allowed = publicClassMethodSurfaces.get(key)
      if (allowed !== undefined) {
        const actual = new Set()
        for (const member of node.members) {
          const methodName = publicCallableMemberName(member)
          if (methodName !== null) actual.add(methodName)
        }

        const extra = [...actual].filter((name) => !allowed.has(name)).sort()
        const missing = [...allowed].filter((name) => !actual.has(name)).sort()
        if (extra.length > 0 || missing.length > 0) {
          violations.push({
            file,
            line: lineFor(sourceFile, node, lineOffset),
            message: `public method surface drift for ${node.name.text}; extra=[${extra.join(', ')}] missing=[${missing.join(', ')}]`,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanSignatureConventions(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  function visit(node) {
    const signatureName = functionLikeName(node, sourceFile)
    const parameterLimit = positionalParameterLimit(node)
    if (signatureName !== null && node.parameters.length > parameterLimit) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `signature has too many positional parameters: ${signatureName} has ${node.parameters.length}, limit is ${parameterLimit}; use a named options object or domain command object`,
      })
    }

    if (ts.isParameter(node) && hasParameterJSDoc(node, sourceFile)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: 'parameter JSDoc is forbidden; move the comment to the options type, class field, or function JSDoc',
      })
    }

    if (ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      if (enforcesOptionalUndefinedConvention(file) && hasOptionalUndefinedUnion(node)) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: 'optional field should not include an outer | undefined; omit the property when no value is present',
        })
      }

      const repeatedRoleName = repeatedTypeRoleName(node)
      if (repeatedRoleName !== null) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `signature name repeats its type name: ${repeatedRoleName}; use a role name like context, options, request, or result`,
        })
      }
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const aliasTarget = thinTypeAliasTarget(node.type)
      if (aliasTarget !== null) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `thin type alias is forbidden: ${node.name.text} = ${aliasTarget}; use the original type or define a real domain shape`,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function positionalParameterLimit(node) {
  if (ts.isConstructorDeclaration(node) && hasConstructorParameterProperty(node)) {
    return maxConstructorParameterPropertyParams
  }
  return maxDefaultPositionalSignatureParams
}

function hasConstructorParameterProperty(node) {
  return node.parameters.some((parameter) => {
    return parameter.modifiers?.some((modifier) => {
      return modifier.kind === ts.SyntaxKind.PublicKeyword
        || modifier.kind === ts.SyntaxKind.PrivateKeyword
        || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        || modifier.kind === ts.SyntaxKind.ReadonlyKeyword
    }) === true
  })
}

function hasParameterJSDoc(node, sourceFile) {
  return /\/\*\*[\s\S]*?\*\//u.test(node.getFullText(sourceFile))
}

function hasOptionalUndefinedUnion(node) {
  return node.questionToken !== undefined
    && node.type !== undefined
    && unionContainsUndefined(unwrapParenthesizedType(node.type))
}

function unionContainsUndefined(typeNode) {
  return ts.isUnionTypeNode(typeNode)
    && typeNode.types.some((part) => unwrapParenthesizedType(part).kind === ts.SyntaxKind.UndefinedKeyword)
}

function unwrapParenthesizedType(typeNode) {
  let current = typeNode
  while (ts.isParenthesizedTypeNode(current)) {
    current = current.type
  }
  return current
}

function functionLikeName(node, sourceFile) {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) {
    return node.name !== undefined && ts.isIdentifier(node.name) ? node.name.text : null
  }

  if (ts.isConstructorDeclaration(node)) {
    return 'constructor'
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) {
      return parent.left.text
    }
  }

  if (isFunctionLikeWithParameters(node)) {
    return null
  }

  return null
}

function publicCallableMemberName(member) {
  if (
    !ts.isMethodDeclaration(member)
    && !ts.isGetAccessorDeclaration(member)
    && !ts.isSetAccessorDeclaration(member)
  ) {
    return null
  }
  if (!ts.isIdentifier(member.name) || hasNonPublicModifier(member)) return null
  return member.name.text
}

function hasNonPublicModifier(node) {
  return (node.modifiers ?? []).some((modifier) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  )
}

function repeatedTypeRoleName(node) {
  if (!ts.isIdentifier(node.name)) return null

  const typeName = typeReferenceName(node.type)
  if (typeName === null) return null
  if (!multiWordTypeNamePattern.test(typeName) || !repeatedRoleTypeSuffixPattern.test(typeName)) return null

  const roleName = node.name.text
  return roleName === lowerCamelCase(typeName) ? `${roleName}=${typeName}` : null
}

function thinTypeAliasTarget(typeNode) {
  if (!ts.isTypeReferenceNode(typeNode) || typeNode.typeArguments !== undefined) return null
  return typeReferenceName(typeNode)
}

function typeReferenceName(typeNode) {
  if (typeNode === undefined || !ts.isTypeReferenceNode(typeNode)) return null
  if (ts.isIdentifier(typeNode.typeName)) return typeNode.typeName.text
  return null
}

function isForbiddenSparkAiSpecifier(specifier) {
  return specifier.startsWith('@spark-appworks/spark-ai/')
    && !allowedSparkAiSpecifiers.has(specifier)
}

function isForbiddenNamespaceDeclaration(node) {
  return ts.isModuleDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text !== 'global'
}

function isForbiddenRemovedAgentNamespaceAccess(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.expression.getText() === removedAgentNamespaceName && forbiddenRemovedAgentNamespaceMembers.has(node.name.text)
  }
  if (ts.isQualifiedName(node)) {
    return node.left.getText() === removedAgentNamespaceName && forbiddenRemovedAgentNamespaceMembers.has(node.right.text)
  }
  return false
}

function isFunctionLikeWithParameters(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
}

function lowerCamelCase(name) {
  return name.length === 0 ? name : `${name[0].toLowerCase()}${name.slice(1)}`
}

function hasMechanicalDeclarationName(node) {
  return (
    ts.isClassDeclaration(node)
    || ts.isFunctionDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
  )
    && node.name !== undefined
    && isMechanicalName(node.name.text)
}

function isMechanicalName(name) {
  return mechanicalNameSuffixPattern.test(name)
}

function isLayeringExportName(name) {
  return layeringExportSuffixPattern.test(name)
}

function isProtocolPublicSurfaceFile(file) {
  return file.endsWith('/index.ts')
    && (
      file.startsWith('packages/spark-ai/src/')
      || file.startsWith('packages/spark-project-model/src/')
    )
}

function isTestFile(file) {
  return file.startsWith('tests/')
    || file.includes('/tests/')
    || file.includes('/__tests__/')
    || file.endsWith('.test.ts')
    || file.endsWith('.test.tsx')
    || file.endsWith('.spec.ts')
    || file.endsWith('.spec.tsx')
}

function enforcesOptionalUndefinedConvention(file) {
  return file.startsWith('packages/spark-ai/src/')
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runAiCodegenCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
