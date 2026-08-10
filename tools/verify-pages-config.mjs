#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  isCliEntrypoint,
  parseCliArgs,
  printViolations,
  readJsonFile,
  relativePath,
} from './verifier-common.mjs'

const PAGES_CONFIG_ROOT = 'backend-api-contracts/characterization-fixtures/pages-config'
const MANIFEST_REL = `${PAGES_CONFIG_ROOT}/manifest.json`
const DELETED_PAGES_REL = `${PAGES_CONFIG_ROOT}/deleted-pages.json`
const REQUIRED_FILES = ['rule.json', 'pagedata.json']

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const FORBIDDEN_PAGE_ID_CHECKS = [
  { pattern: /^_plan_/u, reason: '_plan_* AI planning probe pageId' },
  { pattern: /^\d+$/u, reason: 'pure numeric pageId' },
  {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    reason: 'UUID pageId',
  },
  {
    pattern: /^ai-(leave-request-form|student-grade-management|employee-info-management)-/iu,
    reason: 'AI e2e probe pageId',
  },
]

function loadManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL)
  const manifest = readJsonFile(manifestPath)
  const projects = manifest.projects
  if (!projects || typeof projects !== 'object') {
    throw new Error(`${MANIFEST_REL} must define projects`)
  }

  const allowlistByProject = new Map()
  for (const [projectKey, pageIds] of Object.entries(projects)) {
    if (!Array.isArray(pageIds)) {
      throw new Error(`${MANIFEST_REL} projects.${projectKey} must be an array`)
    }
    allowlistByProject.set(projectKey, new Set(pageIds))
  }
  return { manifestPath, allowlistByProject }
}

function forbiddenPageIdReason(pageId) {
  for (const check of FORBIDDEN_PAGE_ID_CHECKS) {
    if (check.pattern.test(pageId)) return check.reason
  }
  if (!KEBAB_CASE.test(pageId)) return 'pageId must be kebab-case (lowercase letters, digits, hyphens)'
  return null
}

function listPageDirectories(root) {
  const pagesConfigDir = path.join(root, PAGES_CONFIG_ROOT)
  const entries = []

  if (!fs.existsSync(pagesConfigDir)) return entries

  for (const tenantId of fs.readdirSync(pagesConfigDir)) {
    const tenantDir = path.join(pagesConfigDir, tenantId)
    if (!fs.statSync(tenantDir).isDirectory()) continue
    if (tenantId === 'README.md') continue

    for (const projectId of fs.readdirSync(tenantDir)) {
      const projectDir = path.join(tenantDir, projectId)
      if (!fs.statSync(projectDir).isDirectory()) continue

      for (const pageId of fs.readdirSync(projectDir)) {
        const pageDir = path.join(projectDir, pageId)
        if (!fs.statSync(pageDir).isDirectory()) continue
        entries.push({
          tenantId,
          projectId,
          projectKey: `${tenantId}/${projectId}`,
          pageId,
          pageDir,
        })
      }
    }
  }

  return entries
}

function loadDeletedPages(root) {
  const deletedPath = path.join(root, DELETED_PAGES_REL)
  if (!fs.existsSync(deletedPath)) return []
  const raw = readJsonFile(deletedPath)
  return Array.isArray(raw.entries) ? raw.entries : []
}

export function scanPagesConfigRules(options = {}) {
  const root = options.root ?? process.cwd()
  const violations = []
  const { manifestPath, allowlistByProject } = loadManifest(root)
  const relManifest = relativePath(root, manifestPath)
  const seenByProject = new Map()

  for (const entry of loadDeletedPages(root)) {
    const projectKey = `${entry.tenantId}/${entry.projectId}`
    const allowlist = allowlistByProject.get(projectKey)
    if (allowlist?.has(entry.pageId)) {
      violations.push({
        file: relativePath(root, path.join(root, DELETED_PAGES_REL)),
        line: 1,
        message: `deleted-pages entry ${projectKey}/${entry.pageId} must not appear in manifest allowlist`,
      })
    }
  }

  for (const page of listPageDirectories(root)) {
    const relPageDir = relativePath(root, page.pageDir)
    const forbiddenReason = forbiddenPageIdReason(page.pageId)
    if (forbiddenReason) {
      violations.push({
        file: relPageDir,
        line: 1,
        message: `${page.pageId}: forbidden pageId (${forbiddenReason})`,
      })
    }

    for (const fileName of REQUIRED_FILES) {
      const filePath = path.join(page.pageDir, fileName)
      if (!fs.existsSync(filePath)) {
        violations.push({
          file: relPageDir,
          line: 1,
          message: `missing required file ${fileName}`,
        })
      }
    }

    const allowlist = allowlistByProject.get(page.projectKey)
    if (!allowlist) {
      violations.push({
        file: relManifest,
        line: 1,
        message: `unregistered project ${page.projectKey}; add manifest.projects entry before committing pages`,
      })
      continue
    }

    if (!allowlist.has(page.pageId)) {
      violations.push({
        file: relPageDir,
        line: 1,
        message: `${page.pageId} is not listed in ${MANIFEST_REL} for ${page.projectKey}`,
      })
    }

    if (!seenByProject.has(page.projectKey)) seenByProject.set(page.projectKey, new Set())
    seenByProject.get(page.projectKey).add(page.pageId)
  }

  for (const [projectKey, allowlist] of allowlistByProject) {
    const seen = seenByProject.get(projectKey) ?? new Set()
    for (const pageId of allowlist) {
      if (!seen.has(pageId)) {
        violations.push({
          file: relManifest,
          line: 1,
          message: `manifest lists missing page directory ${projectKey}/${pageId}`,
        })
      }
    }
  }

  return { violations }
}

export function runPagesConfigCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd() })
  const { violations } = scanPagesConfigRules({ root: args.root })
  if (violations.length > 0) {
    printViolations('pages-config', violations)
    return 1
  }
  console.log('pages-config: ok')
  return 0
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runPagesConfigCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
