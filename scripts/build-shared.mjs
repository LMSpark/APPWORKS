#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))

export const ROOT_DIR = resolve(SCRIPT_DIR, '..')
export const PACKAGES_DIR_NAME = 'packages'
export const PACKAGES_DIR = resolve(ROOT_DIR, PACKAGES_DIR_NAME)

export function runCommand(cmd, options = {}) {
  const cwd = options.cwd ?? ROOT_DIR
  const env = options.env ?? process.env
  const stdio = options.stdio ?? 'inherit'
  if (options.log !== false) {
    console.log(`\n> ${cmd}\n`)
  }
  execSync(cmd, { cwd, env, stdio })
}
