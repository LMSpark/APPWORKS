#!/usr/bin/env node
/**
 * 断言 backend-api-contracts 与 spark-lowcode-api 的 AjaxResult 字段同形，
 * 禁止再出现「台账可选 Code / 运行必填 Code」双合同。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

const LEDGER_REL = 'backend-api-contracts/common.ts'
const RUNTIME_REL = 'packages/spark-lowcode-api/src/contracts/lowcode-ajax-result.ts'
const TYPE_NAME = 'AjaxResult'
const REQUIRED_FIELDS = ['Code', 'Message', 'Result', 'Type', 'Extras', 'Time']

function createSource(fileLabel, sourceText) {
  return ts.createSourceFile(fileLabel, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function findAjaxResultAlias(sourceFile) {
  /** @type {ts.TypeAliasDeclaration | null} */
  let found = null
  function visit(node) {
    if (found !== null) return
    if (ts.isTypeAliasDeclaration(node) && node.name.text === TYPE_NAME) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function extractReadonlyObjectMembers(typeNode) {
  if (!typeNode) return null
  /** @type {ts.TypeLiteralNode | null} */
  let literal = null
  if (ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === 'Readonly' && typeNode.typeArguments?.[0]) {
    const arg = typeNode.typeArguments[0]
    if (ts.isTypeLiteralNode(arg)) literal = arg
  } else if (ts.isTypeLiteralNode(typeNode)) {
    literal = typeNode
  }
  if (literal === null) return null
  const names = []
  for (const member of literal.members) {
    if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
      names.push(member.name.text)
    }
  }
  return names.sort()
}

function main() {
  const root = process.cwd()
  const violations = []
  const ledgerPath = path.join(root, LEDGER_REL)
  const runtimePath = path.join(root, RUNTIME_REL)

  for (const filePath of [ledgerPath, runtimePath]) {
    if (!fs.existsSync(filePath)) {
      violations.push({
        file: relativePath(root, filePath),
        line: 0,
        message: '源文件不存在',
      })
    }
  }
  if (violations.length > 0) {
    printViolations(violations)
    process.exit(1)
  }

  const ledgerAlias = findAjaxResultAlias(createSource(LEDGER_REL, fs.readFileSync(ledgerPath, 'utf8')))
  const runtimeAlias = findAjaxResultAlias(createSource(RUNTIME_REL, fs.readFileSync(runtimePath, 'utf8')))

  if (ledgerAlias === null) {
    violations.push({ file: LEDGER_REL, line: 0, message: `未找到 type ${TYPE_NAME}` })
  }
  if (runtimeAlias === null) {
    violations.push({ file: RUNTIME_REL, line: 0, message: `未找到 type ${TYPE_NAME}` })
  }
  if (violations.length > 0) {
    printViolations(violations)
    process.exit(1)
  }

  const ledgerFields = extractReadonlyObjectMembers(ledgerAlias.type)
  const runtimeFields = extractReadonlyObjectMembers(runtimeAlias.type)
  if (ledgerFields === null || runtimeFields === null) {
    printViolations([{
      file: LEDGER_REL,
      line: 0,
      message: `${TYPE_NAME} 必须是 Readonly<{ ... }> 类型别名`,
    }])
    process.exit(1)
  }

  if (ledgerFields.join(',') !== runtimeFields.join(',')) {
    printViolations([{
      file: LEDGER_REL,
      line: ledgerAlias.getStart(),
      message: `${TYPE_NAME} 字段不一致：ledger=[${ledgerFields.join(',')}] runtime=[${runtimeFields.join(',')}]`,
    }])
    process.exit(1)
  }

  for (const field of REQUIRED_FIELDS) {
    if (!ledgerFields.includes(field)) {
      violations.push({
        file: LEDGER_REL,
        line: 0,
        message: `${TYPE_NAME} 缺少字段 ${field}`,
      })
    }
  }

  // Code 不得为 optional（问号）
  for (const [label, alias, rel] of [
    ['ledger', ledgerAlias, LEDGER_REL],
    ['runtime', runtimeAlias, RUNTIME_REL],
  ]) {
    const text = alias.getText()
    if (/Code\?\s*:/.test(text)) {
      violations.push({
        file: rel,
        line: 0,
        message: `${label} ${TYPE_NAME}.Code 不得 optional`,
      })
    }
  }

  if (violations.length > 0) {
    printViolations(violations)
    process.exit(1)
  }

  console.info(`OK: ${TYPE_NAME} parity (${ledgerFields.join(', ')})`)
}

if (isCliEntrypoint(import.meta.url)) {
  main()
}

export { main }
