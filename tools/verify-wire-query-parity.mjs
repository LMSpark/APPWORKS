#!/usr/bin/env node
/**
 * 断言 backend-api-contracts 与 spark-lowcode-api 的 OrderType / WireFilterOperator / GroupFunType 字面量同形，
 * 并禁止台账再使用与 spark-data 冲突的正式名 FilterOperator。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

const LEDGER_REL = 'backend-api-contracts/common.ts'
const RUNTIME_REL = 'packages/spark-lowcode-api/src/contracts/lowcode-wire-query.ts'
const BANNED_LEDGER_ALIAS = 'FilterOperator'

const EXPECTED = {
  OrderType: ['ascending', 'descending'],
  GroupFunType: ['avg', 'count', 'max', 'min', 'sum'],
  WireFilterOperator: [
    'contains',
    'endswith',
    'equal',
    'greaterthan',
    'greaterthanorequal',
    'in',
    'isempty',
    'isnotempty',
    'isnotnull',
    'isnull',
    'lessthan',
    'lessthanorequal',
    'nolike',
    'nostartswith',
    'notendswith',
    'notequal',
    'notin',
    'startswith',
  ],
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

function collectStringLiteralUnion(typeNode) {
  /** @type {string[]} */
  const values = []
  function visit(node) {
    if (ts.isUnionTypeNode(node)) {
      for (const member of node.types) visit(member)
      return
    }
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      values.push(node.literal.text)
    }
  }
  visit(typeNode)
  return values.sort()
}

function assertParity(violations, label, rel, alias, expected) {
  if (alias === null) {
    violations.push({ file: rel, line: 0, message: `未找到 type ${label}` })
    return
  }
  const values = collectStringLiteralUnion(alias.type)
  if (values.join(',') !== expected.join(',')) {
    violations.push({
      file: rel,
      line: alias.getStart(),
      message: `${label} 字面量不一致：actual=[${values.join(',')}] expected=[${expected.join(',')}]`,
    })
  }
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
    printViolations('wire query parity', violations)
    process.exit(1)
  }

  const ledgerSource = createSource(LEDGER_REL, fs.readFileSync(ledgerPath, 'utf8'))
  const runtimeSource = createSource(RUNTIME_REL, fs.readFileSync(runtimePath, 'utf8'))

  if (findTypeAlias(ledgerSource, BANNED_LEDGER_ALIAS) !== null) {
    violations.push({
      file: LEDGER_REL,
      line: 0,
      message: `禁止台账正式名 ${BANNED_LEDGER_ALIAS}；改用 WireFilterOperator`,
    })
  }

  for (const typeName of Object.keys(EXPECTED)) {
    const expected = EXPECTED[typeName]
    assertParity(violations, typeName, LEDGER_REL, findTypeAlias(ledgerSource, typeName), expected)
    assertParity(violations, typeName, RUNTIME_REL, findTypeAlias(runtimeSource, typeName), expected)
  }

  if (violations.length > 0) {
    printViolations('wire query parity', violations)
    process.exit(1)
  }

  console.info(
    `OK: wire query parity (OrderType=${EXPECTED.OrderType.join('|')}; GroupFunType=${EXPECTED.GroupFunType.join('|')}; WireFilterOperator=${EXPECTED.WireFilterOperator.length} ops)`,
  )
}

if (isCliEntrypoint(import.meta.url)) {
  main()
}

export { main }
