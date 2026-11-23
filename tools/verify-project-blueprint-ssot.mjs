#!/usr/bin/env node
/**
 * 断言项目蓝图公共事实源：NodeKind 只定义在 spark-utils，
 * ProjectBlueprintNode 和记录归 spark-project-model，lowcode-api 不保留蓝图出口。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

const SSOT_REL = 'packages/spark-utils/src/contract/project-blueprint-node-kind.ts'
const CONSUMER_RELS = [
  'packages/spark-project-model/src/blueprint/project-blueprint-node.ts',
  'packages/spark-project-model/src/io/project-blueprint-record-codec.ts',
]
const TYPE_NAME = 'ProjectBlueprintNodeKind'
const CONST_NAME = 'PROJECT_BLUEPRINT_NODE_KINDS'
const MODEL_NODE_REL = 'packages/spark-project-model/src/blueprint/project-blueprint-node.ts'
const MODEL_RECORD_REL = 'packages/spark-project-model/src/blueprint/project-blueprint-record.ts'
const NODE_CLASS_NAME = 'ProjectBlueprintNode'
const RECORD_NAME = 'ProjectBlueprintRecord'
const LOWCODE_SRC_REL = 'src/platform-adapters/api'
const FORBIDDEN_LOWCODE_SYMBOLS = [
  'platform/project-blueprint',
  'LowcodeProjectBlueprint',
  'ProjectBlueprintRecord',
  'BlueprintFileVersion',
  'LOWCODE_BLUEPRINT_FILE_NAMES',
  'PageToolPublicationVersion',
  'BlueprintRuntimeNavigation',
  'ProjectBlueprintOutputs',
  'ProjectBlueprintStructureOutputs',
  'ProjectBlueprintDeliveryOutputs',
  'ProjectBlueprintPlanningOutputs',
  'ProjectBlueprintGovernanceOutputs',
  'ProjectBlueprintAiOutputs',
  'ProjectBlueprintDocumentOutputs',
  'ProjectBlueprintMutationPlanner',
  'pageRuntimeClosures',
  'LowcodeProjectBlueprintTreeNode',
  'toShellRuntimeNavigation',
]
const FORBIDDEN_LOWCODE_CLASS_NAMES = [
  'ProjectBlueprint',
  NODE_CLASS_NAME,
  'ProjectBlueprintApi',
]
const FORBIDDEN_LOWCODE_TYPE_ALIASES = [
  'RuntimeNavigationTargetKind',
  'RuntimeNavigationAuthorizationEvidence',
  'RuntimeNavigationAuthorizationItem',
  'RuntimeNavigationAuthorizationContext',
  'ProjectBlueprintDocumentKind',
  'ProjectBlueprintDocumentTask',
  'ProjectBlueprintDocumentCoverage',
  'ProjectBlueprintDocumentSubmitOptions',
]

function walkTsFiles(dir) {
  /** @type {string[]} */
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(full))
      continue
    }
    if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

function scanForbiddenLowcodeSymbols(root, violations) {
  const lowcodeSrc = path.join(root, LOWCODE_SRC_REL)
  for (const filePath of walkTsFiles(lowcodeSrc)) {
    const rel = relativePath(root, filePath)
    const text = fs.readFileSync(filePath, 'utf8')
    const source = createSource(rel, text)
    for (const symbol of FORBIDDEN_LOWCODE_SYMBOLS) {
      if (!text.includes(symbol)) continue
      const line = text.split(/\r?\n/).findIndex((row) => row.includes(symbol)) + 1
      violations.push({
        file: rel,
        line,
        message: `平台适配器禁止回生 ${symbol}；壳导航/领域输出由 src/platform-adapters 与 spark-project-model 装配`,
      })
    }
    for (const className of FORBIDDEN_LOWCODE_CLASS_NAMES) {
      const found = findClass(source, className)
      if (found === null) continue
      const { line } = source.getLineAndCharacterOfPosition(found.getStart(source))
      violations.push({
        file: rel,
        line: line + 1,
        message: `平台适配器禁止领域聚合 class ${className}`,
      })
    }
    for (const typeName of FORBIDDEN_LOWCODE_TYPE_ALIASES) {
      const found = findTypeAlias(source, typeName)
      if (found === null) continue
      const { line } = source.getLineAndCharacterOfPosition(found.getStart(source))
      violations.push({
        file: rel,
        line: line + 1,
        message: `平台适配器禁止定义 ${typeName}；蓝图领域合同与宿主授权不属于该层`,
      })
    }
  }
}

function createSource(fileLabel, sourceText) {
  return ts.createSourceFile(fileLabel, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function findTypeAlias(sourceFile, typeName) {
  /** @type {ts.TypeAliasDeclaration | null} */
  let found = null
  function visit(node) {
    if (found !== null) return
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function findConst(sourceFile, constName) {
  /** @type {ts.VariableDeclaration | null} */
  let found = null
  function visit(node) {
    if (found !== null) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === constName) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function findClass(sourceFile, className) {
  /** @type {ts.ClassDeclaration | null} */
  let found = null
  function visit(node) {
    if (found !== null) return
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function importsTypeFromSparkUtils(sourceFile, typeName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== '@spark-appworks/spark-utils') continue
    const named = statement.importClause.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      if (element.name.text === typeName) return true
    }
  }
  return false
}

function reexportsTypeFromSparkUtils(sourceFile, typeName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue
    if (!ts.isNamedExports(statement.exportClause)) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== '@spark-appworks/spark-utils') continue
    for (const element of statement.exportClause.elements) {
      if (element.name.text === typeName) return true
    }
  }
  return false
}

export function verifyProjectBlueprintSsot(root = process.cwd()) {
  /** @type {{ file: string, line: number, message: string }[]} */
  const violations = []
  const ssotPath = path.join(root, SSOT_REL)

  if (!fs.existsSync(ssotPath)) {
    violations.push({ file: SSOT_REL, line: 0, message: 'SSOT 源文件不存在' })
    return { ok: false, violations }
  }

  const ssotSource = createSource(SSOT_REL, fs.readFileSync(ssotPath, 'utf8'))
  if (findTypeAlias(ssotSource, TYPE_NAME) === null) {
    violations.push({ file: SSOT_REL, line: 0, message: `缺少 type ${TYPE_NAME}` })
  }
  if (findConst(ssotSource, CONST_NAME) === null) {
    violations.push({ file: SSOT_REL, line: 0, message: `缺少 const ${CONST_NAME}` })
  }

  for (const rel of CONSUMER_RELS) {
    const filePath = path.join(root, rel)
    if (!fs.existsSync(filePath)) {
      violations.push({ file: relativePath(root, filePath), line: 0, message: '源文件不存在' })
      continue
    }
    const source = createSource(rel, fs.readFileSync(filePath, 'utf8'))
    const localAlias = findTypeAlias(source, TYPE_NAME)
    if (localAlias !== null) {
      const { line } = source.getLineAndCharacterOfPosition(localAlias.getStart(source))
      violations.push({
        file: rel,
        line: line + 1,
        message: `${TYPE_NAME} 必须从 @spark-appworks/spark-utils 导入，禁止本地 type alias 定义`,
      })
    }
    if (!importsTypeFromSparkUtils(source, TYPE_NAME)) {
      violations.push({
        file: rel,
        line: 0,
        message: `必须从 @spark-appworks/spark-utils 导入 ${TYPE_NAME}`,
      })
    }
    if (reexportsTypeFromSparkUtils(source, TYPE_NAME)) {
      violations.push({
        file: rel,
        line: 0,
        message: `禁止 re-export ${TYPE_NAME}；消费方应直连 @spark-appworks/spark-utils`,
      })
    }
  }

  const modelNodePath = path.join(root, MODEL_NODE_REL)
  if (fs.existsSync(modelNodePath)) {
    const modelSource = createSource(MODEL_NODE_REL, fs.readFileSync(modelNodePath, 'utf8'))
    if (findClass(modelSource, NODE_CLASS_NAME) === null) {
      violations.push({ file: MODEL_NODE_REL, line: 0, message: `缺少唯一领域 class ${NODE_CLASS_NAME}` })
    }
  }
  const recordPath = path.join(root, MODEL_RECORD_REL)
  if (!fs.existsSync(recordPath) || findTypeAlias(createSource(MODEL_RECORD_REL, fs.readFileSync(recordPath, 'utf8')), RECORD_NAME) === null) {
    violations.push({ file: MODEL_RECORD_REL, line: 0, message: `缺少领域记录 ${RECORD_NAME}` })
  }

  scanForbiddenLowcodeSymbols(root, violations)

  return { ok: violations.length === 0, violations }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { ok, violations } = verifyProjectBlueprintSsot(root)
  if (!ok) {
    printViolations('Project blueprint SSOT', violations)
    process.exitCode = 1
    return
  }
  console.log(`OK: ${TYPE_NAME} owned by spark-utils; ${NODE_CLASS_NAME} and ${RECORD_NAME} owned by spark-project-model`)
}

if (isCliEntrypoint(import.meta.url)) {
  main()
}
