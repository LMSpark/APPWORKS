#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'glob'

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)))

const SCAN_GLOBS = [
  'packages/spark-ai/src/**/*.{ts,tsx,js,mjs}',
  'packages/vite-plugin-spark-catalog/src/**/*.{ts,tsx,js,mjs}',
  'packages/spark-project-model/src/**/*.{ts,tsx,js,mjs}',
]

const TERMS = [
  { label: '人力资源', pattern: /人力资源/u },
  { label: '员工', pattern: /员工/u },
  { label: '组织架构', pattern: /组织架构/u },
  { label: '招聘', pattern: /招聘/u },
  { label: '入职', pattern: /入职/u },
  { label: '人事异动', pattern: /人事异动/u },
  { label: '考勤', pattern: /考勤/u },
  { label: '排班', pattern: /排班/u },
  { label: '请假', pattern: /请假/u },
  { label: '加班', pattern: /加班/u },
  { label: '薪酬', pattern: /薪酬/u },
  { label: '社保', pattern: /社保/u },
  { label: '公积金', pattern: /公积金/u },
  { label: '绩效', pattern: /绩效/u },
  { label: '培训', pattern: /培训/u },
  { label: 'HR', pattern: /\bHR\b/u },
  { label: 'employee', pattern: /\bemployee\b/iu },
  { label: 'payroll', pattern: /\bpayroll\b/iu },
  { label: 'attendance', pattern: /\battendance\b/iu },
  { label: 'recruitment', pattern: /\brecruitment\b/iu },
  { label: 'onboarding', pattern: /\bonboarding\b/iu },
  { label: 'performance', pattern: /\bperformance\b/iu },
  { label: 'compensation', pattern: /\bcompensation\b/iu },
]

const files = await glob(SCAN_GLOBS, {
  cwd: ROOT_DIR,
  absolute: true,
  nodir: true,
  windowsPathsNoEscape: true,
  ignore: [
    '**/tests/**',
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],
})

const findings = []
for (const file of files) {
  const text = await readFile(file, 'utf8')
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const term of TERMS) {
      if (term.pattern.test(line)) {
        findings.push({
          file: relative(ROOT_DIR, file),
          line: index + 1,
          term: term.label,
          text: line.trim(),
        })
      }
    }
  }
}

if (findings.length > 0) {
  console.error('AI business boundary check failed: HR domain terms leaked into common ClassModel/Spark AI layers.')
  for (const finding of findings.slice(0, 40)) {
    console.error(`${finding.file}:${finding.line} [${finding.term}] ${finding.text}`)
  }
  if (findings.length > 40) {
    console.error(`... ${findings.length - 40} more finding(s) omitted`)
  }
  process.exitCode = 1
} else {
  console.log('AI business boundary check passed.')
}
