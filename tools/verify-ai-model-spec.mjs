#!/usr/bin/env node

/**
 * AI 生成模型规范验证脚本。
 *
 * 检查业务模型 class 是否符合 packages/spark-ai/docs/ai-model-spec.md 规范：
 * 1. 模型 class 是否有 toJson()（extends SparkAIModel 或快照/树模型）
 * 2. 快照/树模型（非 SparkAIModel 子类）是否有 static fromJson 等工厂方法
 * 3. fromJson 签名是否接受 Record<string, unknown> | string
 * 4. 继承链父类 fromJson 判别分发（info）
 *
 * SparkAIModel 子类：协议只强制 toJson；save/load/fromJson 按需，不强制 fromJson。
 *
 * 用法：
 *   node tools/verify-ai-model-spec.mjs [--strict] [--root DIR]
 */

import process from 'node:process'
import ts from 'typescript'
import {
  collectSourceFiles,
  createDefaultExcluder,
  forEachParsedSource,
  isCliEntrypoint,
  lineFor,
  printViolations,
} from './verifier-common.mjs'

const MODEL_ROOTS = ['packages/spark-data/src', 'packages/spark-project-model/src', 'src']

/** 不扫描的子目录（非业务模型：策略/委托/IO/基础设施） */
const EXCLUDED_SUBDIRS = new Set([
  '/strategies/',
  '/core/',
  '/io/',
  '/crud-service',
])

/** 与 class-model-class-lifecycle-audit.ts 的 STATIC_FACTORY_NAMES 对齐 */
const STATIC_FACTORY_NAMES = new Set([
  'fromJson',
  'fromDataSet',
  'fromRuleJson',
  'reconcileFromJson',
])

// ─── class 信息提取 ───

/**
 * 从 class 声明中提取方法信息。
 * 返回 { instanceMethods: Set<string>, staticMethods: Set<string> }
 */
function extractClassMethods(decl) {
  const instanceMethods = new Set()
  const staticMethods = new Set()

  for (const member of decl.members) {
    if (!ts.isMethodDeclaration(member)) continue
    const name = member.name?.getText?.()
    if (!name) continue
    if (ts.isConstructorDeclaration(member)) continue

    if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) {
      staticMethods.add(name)
    } else {
      instanceMethods.add(name)
    }
  }

  return { instanceMethods, staticMethods }
}

/**
 * 检查 static fromJson 方法的第一个参数签名是否接受
 * Metadata | Record<string, unknown> | string 三种类型。
 */
function hasJsonOrStringParameter(decl, staticMethods) {
  for (const member of decl.members) {
    if (!ts.isMethodDeclaration(member)) continue
    const name = member.name?.getText?.()
    if (!name || !STATIC_FACTORY_NAMES.has(name)) continue
    if (!(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static)) continue

    // 检查参数类型文本中是否包含 string 或 Record<string, unknown>
    const sourceFile = member.getSourceFile()
    const paramTexts = member.parameters.map(p => p.type?.getText(sourceFile) ?? '')
    const joined = paramTexts.join('|')
    const acceptsString = joined.includes('string')
    const acceptsRecord = joined.includes('Record<string, unknown>') || joined.includes('Record<string,unknown>')
    return { acceptsString, acceptsRecord, methodName: name, paramTexts }
  }
  return null
}

/**
 * 检查 class 是否 extends 某个父类，返回父类名。
 */
function getExtendsClassName(decl) {
  if (!decl.heritageClauses) return null
  for (const clause of decl.heritageClauses) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue
    const firstType = clause.types[0]
    if (firstType && ts.isIdentifier(firstType.expression)) {
      return firstType.expression.text
    }
  }
  return null
}

function extendsSparkAIModel(decl) {
  return getExtendsClassName(decl) === 'SparkAIModel'
}

/**
 * 判断文件是否为测试文件。
 */
function isTestFile(file) {
  const normalized = file.replace(/\\/gu, '/')
  return normalized.includes('.test.') || normalized.includes('/tests/') || normalized.includes('/__tests__/')
}

// ─── 扫描逻辑 ───

function scanModelClass(parsed, violations, strict) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  // 跳过策略/委托/IO/基础设施等非业务模型子目录
  const normalizedFile = file.replace(/\\/gu, '/')
  if ([...EXCLUDED_SUBDIRS].some(dir => normalizedFile.includes(dir))) return

  function visit(node) {
    if (!ts.isClassDeclaration(node) || node.name === undefined) {
      ts.forEachChild(node, visit)
      return
    }

    const className = node.name.text

    // 识别业务模型 class：只靠结构，不靠自定义 JSDoc 标签。
    const isExported = ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export
    const { instanceMethods, staticMethods } = extractClassMethods(node)

    const hasToJson = instanceMethods.has('toJson') || instanceMethods.has('toJSON')
    const hasStaticFactory = [...staticMethods].some(m => STATIC_FACTORY_NAMES.has(m))
    const isSparkAIModel = extendsSparkAIModel(node)

    // 只扫描：导出的 + (SparkAIModel 子类 或 已有序列化方法)
    if (!isExported) { ts.forEachChild(node, visit); return }
    if (!isSparkAIModel && !hasToJson && !hasStaticFactory) {
      ts.forEachChild(node, visit)
      return
    }

    const level = strict ? 'error' : 'warn'

    // Check 1: 快照/树模型缺少 toJson()
    if (!hasToJson) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `[${level}] ${className} has no toJson() instance method`,
      })
    }

    // Check 2: 快照类缺少 static fromJson（SparkAIModel 持久化子类豁免）
    if (!hasStaticFactory && !isSparkAIModel) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `[${level}] ${className} has no static fromJson() factory; add static fromJson(json: ...) or extends SparkAIModel`,
      })
    }

    // Check 3: fromJson 签名检查
    if (hasStaticFactory) {
      const sigInfo = hasJsonOrStringParameter(node, staticMethods)
      if (sigInfo && (!sigInfo.acceptsString || !sigInfo.acceptsRecord)) {
        const missing = []
        if (!sigInfo.acceptsString) missing.push('string')
        if (!sigInfo.acceptsRecord) missing.push('Record<string, unknown>')
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `[${level}] ${className}.${sigInfo.methodName}() parameter type should accept ${missing.join(' and ')}; current signature: ${sigInfo.paramTexts.join(', ')}`,
        })
      }
    }

    // Check 4: 继承链判别分发（info 级别）
    const parentName = getExtendsClassName(node)
    if (parentName && hasStaticFactory) {
      // 这是一个子类且有 fromJson，检查其 toJson 是否包含判别字段
      // 只做 info 提示，不做强制要求
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `[info] ${className} extends ${parentName} with static fromJson; ensure parent class uses discriminator dispatch for polymorphic deserialization`,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

// ─── CLI 入口 ───

export function runModelSpecCli(argv = process.argv.slice(2)) {
  const strict = argv.includes('--strict')
  const filteredArgv = argv.filter(a => a !== '--strict')

  const root = process.cwd()
  const files = collectSourceFiles({
    root,
    includeRoots: MODEL_ROOTS,
    includeFiles: [],
    exclude: createDefaultExcluder(root),
  })

  const violations = []

  for (const filePath of files) {
    forEachParsedSource(filePath, root, (parsed) => {
      scanModelClass(parsed, violations, strict)
    })
  }

  const errors = violations.filter(v => v.message.startsWith('[error]'))
  const warns = violations.filter(v => v.message.startsWith('[warn]'))
  const infos = violations.filter(v => v.message.startsWith('[info]'))

  if (infos.length > 0) {
    console.info('AI model spec info:')
    for (const v of infos) {
      console.info(`  ${v.file}:${v.line} ${v.message}`)
    }
  }

  if (warns.length > 0) {
    printViolations('AI model spec warnings', warns)
  }

  if (errors.length > 0) {
    printViolations('AI model spec errors', errors)
    return 1
  }

  if (strict && warns.length > 0) {
    console.error('Strict mode: warnings are treated as errors.')
    return 1
  }

  const checkedCount = files.length
  const warnCount = warns.length
  const infoCount = infos.length
  console.info(`AI model spec scan passed: ${checkedCount} file(s) checked, ${warnCount} warning(s), ${infoCount} info(s).`)
  return 0
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runModelSpecCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
