#!/usr/bin/env node
/**
 * 断言 backend-api-contracts 与 spark-lowcode-api 的 SendCodeType / SendCodeScene 字面量同形，
 * 禁止再出现 LowcodeVerificationChannel 等第二正式名。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

const LEDGER_REL = 'backend-api-contracts/common.ts'
const RUNTIME_REL = 'packages/spark-lowcode-api/src/contracts/lowcode-send-code.ts'
const BANNED_REL = 'packages/spark-lowcode-api/src'
const BANNED_ALIAS = 'LowcodeVerificationChannel'

const EXPECTED = {
  SendCodeType: ['EMAIL', 'MOBILE'],
  SendCodeScene: [
    'ADMIN_RESET_PASSWORD',
    'ALIYUN_IDENTITY_VERIFY_BIND',
    'BIND',
    'BIND_THIRD_ACCOUNT',
    'CHANGE_PASSWORD',
    'CHANGE_PASSWORD_BY_OLD_PASS',
    'EDIT_ENT',
    'ENT_USER_BIND',
    'ENT_USER_LOGIN',
    'ENT_USER_REBIND',
    'FACE',
    'IDENTITY_VERIFY_BIND',
    'LOGIN',
    'REBIND',
    'REGISTER',
    'REGISTER_ENT',
    'RESET_PASSWORD',
    'UNBIND_THIRD_ACCOUNT',
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

function walkTsFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
}

function assertParity(violations, typeName, rel, alias, expected) {
  if (alias === null) {
    violations.push({ file: rel, line: 0, message: `未找到 type ${typeName}` })
    return
  }
  const values = collectStringLiteralUnion(alias.type)
  if (values.join(',') !== expected.join(',')) {
    violations.push({
      file: rel,
      line: alias.getStart(),
      message: `${typeName} 字面量不一致：actual=[${values.join(',')}] expected=[${expected.join(',')}]`,
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
    printViolations('send-code parity', violations)
    process.exit(1)
  }

  const ledgerSource = createSource(LEDGER_REL, fs.readFileSync(ledgerPath, 'utf8'))
  const runtimeSource = createSource(RUNTIME_REL, fs.readFileSync(runtimePath, 'utf8'))

  for (const typeName of Object.keys(EXPECTED)) {
    const expected = EXPECTED[typeName]
    assertParity(violations, typeName, LEDGER_REL, findTypeAlias(ledgerSource, typeName), expected)
    assertParity(violations, typeName, RUNTIME_REL, findTypeAlias(runtimeSource, typeName), expected)
  }

  const bannedFiles = []
  walkTsFiles(path.join(root, BANNED_REL), bannedFiles)
  for (const filePath of bannedFiles) {
    const text = fs.readFileSync(filePath, 'utf8')
    if (!text.includes(BANNED_ALIAS)) continue
    const source = createSource(relativePath(root, filePath), text)
    function visit(node) {
      if (
        (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
        && node.name.text === BANNED_ALIAS
      ) {
        violations.push({
          file: relativePath(root, filePath),
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          message: `禁止复活 ${BANNED_ALIAS}；使用 SendCodeType`,
        })
      }
      if (ts.isIdentifier(node) && node.text === BANNED_ALIAS) {
        const parent = node.parent
        if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
          violations.push({
            file: relativePath(root, filePath),
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            message: `禁止导入/导出 ${BANNED_ALIAS}；使用 SendCodeType`,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  if (violations.length > 0) {
    printViolations('send-code parity', violations)
    process.exit(1)
  }

  console.info(
    `OK: send-code parity (SendCodeType=${EXPECTED.SendCodeType.join('|')}; SendCodeScene=${EXPECTED.SendCodeScene.length} scenes)`,
  )
}

if (isCliEntrypoint(import.meta.url)) {
  main()
}

export { main }
