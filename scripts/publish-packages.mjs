#!/usr/bin/env node
/**
 * publish-packages.mjs
 *
 * 构建并发布所有 @spark-appworks/* 子包到 npm。
 *
 * 用法：
 *   node scripts/publish-packages.mjs [--dry-run] [--tag <tag>]
 *
 * 选项：
 *   --dry-run     只构建，不实际发布
 *   --tag <tag>   发布 tag（默认 latest）
 *
 * 注意：必须使用 `pnpm publish` 而非 `npm publish`。
 *   pnpm 会在打包时自动将 workspace:* 替换为实际版本号；
 *   npm publish 不具备此能力，会导致 workspace:* 原样写入 tarball，
 *   消费者安装时因无法解析 workspace: 协议而报错。
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PACKAGES_DIR, ROOT_DIR, runCommand } from './build-shared.mjs'
import { resolvePackagesInBuildOrder } from './lib/sort-packages-by-dependency.mjs'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const tagIdx = args.indexOf('--tag')
const TAG = tagIdx !== -1 ? args[tagIdx + 1] : 'latest'
const otpIdx = args.indexOf('--otp')
const OTP = otpIdx !== -1 ? args[otpIdx + 1] : null

const run = (cmd, cwd = ROOT_DIR) => execSync(cmd, { cwd, stdio: 'inherit' })

console.log('\n📦 构建所有子包...')
runCommand('node scripts/build-packages.mjs', { cwd: ROOT_DIR })

const packages = resolvePackagesInBuildOrder(PACKAGES_DIR)
console.log('\n📋 发布顺序:', packages.join(' → '))

for (const pkg of packages) {
  const pkgDir = join(PACKAGES_DIR, pkg)
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
  const pkgName = pkgJson.name
  const pkgVersion = pkgJson.version

  if (DRY_RUN) {
    // dry-run 时用 pnpm pack 验证产物中 workspace:* 已被替换
    console.log(`\n[dry-run] 检查打包产物: ${pkg}`)
    run(`pnpm pack --dry-run`, pkgDir)
    continue
  }

  // 检查版本是否已在 npm 发布，若已发布则跳过（显式查 npmjs.org，避免走镜像源延迟）
  let alreadyPublished = false
  try {
    const result = execSync(`npm view ${pkgName}@${pkgVersion} version --registry https://registry.npmjs.org`, { cwd: pkgDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (result === pkgVersion) alreadyPublished = true
  } catch (_) { /* 未发布 */ }

  if (alreadyPublished) {
    console.log(`\n⏭️  跳过 ${pkgName}@${pkgVersion}（已发布）`)
    continue
  }

  console.log(`\n🚀 发布 ${pkg} (${pkgVersion}) ...`)
  // 使用 pnpm publish：自动将 dependencies 中的 workspace:* 替换为实际解析版本
  // 显式指定 registry 避免走 npmmirror 镜像
  const otpFlag = OTP ? ` --otp ${OTP}` : ''
  try {
    run(`pnpm publish --access public --tag ${TAG} --no-git-checks --registry https://registry.npmjs.org${otpFlag}`, pkgDir)
  } catch (e) {
    console.error(`\n❌ 发布 ${pkgName}@${pkgVersion} 失败: ${e.message}`)
    process.exitCode = 1
  }
}

console.log(DRY_RUN ? '\n✅ Dry-run 完成。' : '\n🎉 Done!')
