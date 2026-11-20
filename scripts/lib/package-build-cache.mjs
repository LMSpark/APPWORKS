import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildDebugBreak } from './build-debug.mjs'

const STAMP_FILE = '.spark-build-stamp.json'
const CONFIG_FILES = ['package.json', 'tsconfig.build.json', 'vite.config.ts', 'vite.config.mjs']

function walkFiles(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkFiles(fullPath, files)
      continue
    }
    if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex')
}

function hashFile(path) {
  return hashText(readFileSync(path))
}

function readPackageMeta(pkgRoot) {
  const packageJsonPath = join(pkgRoot, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  return {
    name: packageJson.name,
    main: packageJson.main ?? './dist/index.js',
    workspaceDeps: Object.keys(packageJson.dependencies ?? {}).filter((dep) => dep.startsWith('@spark-appworks/')),
  }
}

/**
 * @param {string} pkgRoot absolute package root
 * @param {Map<string, string>} dependencyFingerprints workspace dep name → fingerprint
 */
export function computePackageInputFingerprint(pkgRoot, dependencyFingerprints = new Map()) {
  const hash = createHash('sha256')
  const meta = readPackageMeta(pkgRoot)

  for (const configFile of CONFIG_FILES) {
    const configPath = join(pkgRoot, configFile)
    if (!existsSync(configPath)) continue
    hash.update(configFile)
    hash.update(hashFile(configPath))
  }

  const srcDir = join(pkgRoot, 'src')
  const srcFiles = walkFiles(srcDir).sort((left, right) => left.localeCompare(right))
  for (const filePath of srcFiles) {
    hash.update(relative(pkgRoot, filePath))
    hash.update(hashFile(filePath))
  }

  for (const depName of meta.workspaceDeps.sort()) {
    hash.update(depName)
    hash.update(dependencyFingerprints.get(depName) ?? 'missing')
  }

  return hash.digest('hex')
}

export function readBuildStamp(pkgRoot) {
  const stampPath = join(pkgRoot, 'dist', STAMP_FILE)
  if (!existsSync(stampPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(stampPath, 'utf8'))
    return typeof parsed.fingerprint === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function writeBuildStamp(pkgRoot, fingerprint) {
  const distDir = join(pkgRoot, 'dist')
  if (!existsSync(distDir)) return
  const stampPath = join(distDir, STAMP_FILE)
  writeFileSync(stampPath, `${JSON.stringify({
    fingerprint,
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`)
}

function mainOutputExists(pkgRoot, mainRelativePath) {
  const outputPath = join(pkgRoot, mainRelativePath)
  return existsSync(outputPath) && statSync(outputPath).isFile()
}

/**
 * @param {string} pkgRoot absolute package root
 * @param {string} fingerprint expected fingerprint
 */
export function isPackageBuildFresh(pkgRoot, fingerprint) {
  const meta = readPackageMeta(pkgRoot)
  const stamp = readBuildStamp(pkgRoot)
  const fresh = Boolean(stamp && stamp.fingerprint === fingerprint && mainOutputExists(pkgRoot, meta.main))
  buildDebugBreak('package-build-cache:fresh-check', {
    pkgRoot,
    fresh,
    fingerprint,
    stampFingerprint: stamp?.fingerprint ?? null,
  })
  return fresh
}
