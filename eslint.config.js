import vuePlugin from 'eslint-plugin-vue'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'src/**/*.d.ts',
      'packages/**/*.d.ts',
      'packages/**/dist/**',  // 排除所有dist目录
      'tools/**',
      'scripts/**',            // 独立脚本，不纳入 tsconfig project
      '**/*.example.ts',
      'dist/**',
      'node_modules/**',
      'vite.config.ts',
      'vitest.config.ts',
      'vitest.spark-ai.config.ts',
      'packages/**/vite.config.ts',
      'packages/**/vitest.config.ts'
    ]
  },
  // Vue SFC files
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        window: 'readonly',
        document: 'readonly'
      }
    },
    plugins: { 
      vue: vuePlugin,
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'vue/html-self-closing': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  // 仓库级限制：禁止引用已移除的 spark-component 历史子路径
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.vue'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@spark-appworks/spark-component',
            importNames: [
              'defineCapability',
              'sparkProvide',
              'sparkRemove',
              'sparkConsume',
              'createSparkCapabilityContext',
              'consumeSparkCapability',
              'createSparkCapabilityConsumer',
              'getSparkCapabilityProvider',
            ],
            message: '能力系统 core 位于 @spark-appworks/spark-utils，请从 @spark-appworks/spark-utils 导入对应符号。'
          },
          {
            name: '@spark-appworks/spark-component',
            allowTypeImports: true,
            importNames: [
              'CapabilityKey',
              'CapabilityName',
              'ICapabilityContext',
              'SparkCapabilityConsumer',
              'CapabilityTypeMap',
            ],
            message: '能力系统 core 类型位于 @spark-appworks/spark-utils，请从 @spark-appworks/spark-utils 导入对应类型。'
          }
        ],
        patterns: [
          {
            group: [
              '@spark-appworks/spark-component/types',
              '@spark-appworks/spark-component/capabilities',
              '@spark-appworks/spark-component/capability-keys',
              '@spark-appworks/spark-component/useSparkComponent',
              '@spark-appworks/spark-component/internal-context',
              '@spark-appworks/spark-component/renderer',
              '@spark-appworks/spark-component/src/types',
              '@spark-appworks/spark-component/src/capabilities',
              '@spark-appworks/spark-component/src/capability-keys',
              '@spark-appworks/spark-component/src/useSparkComponent',
              '@spark-appworks/spark-component/src/internal-context',
              '@spark-appworks/spark-component/src/renderer'
            ],
            message: '这些 spark-component 历史子路径已移除，请改用包根出口或现行 core/page/system/internal 路径。'
          },
          {
            group: [
              '**/spark-component/src/types',
              '**/spark-component/src/types.*',
              '**/spark-component/src/capabilities',
              '**/spark-component/src/capabilities.*',
              '**/spark-component/src/capability-keys',
              '**/spark-component/src/capability-keys.*',
              '**/spark-component/src/useSparkComponent',
              '**/spark-component/src/useSparkComponent.*',
              '**/spark-component/src/internal-context',
              '**/spark-component/src/internal-context.*',
              '**/spark-component/src/renderer',
              '**/spark-component/src/renderer/**'
            ],
            message: '禁止引用 spark-component 已删除的旧源码入口，请改用现行目录结构。'
          }
        ]
      }]
    }
  },
  // Core package restriction: prevent importing concrete UI components into core
  {
    files: ['packages/spark-component/**'],
    rules: {
      'no-restricted-imports': ['error', { 'patterns': ['**/*.vue', '**/features/**'] }]
    }
  },
  // Allow Vue SFC imports in spark-component component/page sub-modules
  {
    files: ['packages/spark-component/src/components/**', 'packages/spark-component/src/page/**'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  // 严禁挎包路径导入：packages 内任何文件不得用相对路径引入其他包的源码
  // 必须通过 @spark-appworks/xxx 包名导入
  {
    files: ['packages/**/*.ts', 'packages/**/*.vue', 'packages/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '../**/spark-utils*',
              '../**/spark-data*',
              '../**/spark-component*',
              '../**/spark-app*',
              '../**/spark-project-model*'
            ],
            message: '禁止挎包路径导入，请使用 @spark-appworks/<package-name> 替代'
          }
        ]
      }]
    }
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './tsconfig.typecheck.json',
          './packages/spark-ai/tsconfig.json',
          './packages/spark-utils/tsconfig.json',
          './packages/spark-data/tsconfig.json',
          './packages/spark-lowcode-api/tsconfig.json',
          './packages/spark-component/tsconfig.json',
          './packages/spark-json-document/tsconfig.json',
          './packages/spark-project-model/tsconfig.json',
          './packages/spark-app/tsconfig.json',
          './packages/vite-plugin-spark-catalog/tsconfig.json'
        ],
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        node: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', { allowNullableBoolean: true, allowNullableString: true, allowNullableNumber: true }],
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      // ── 产品级新增规则 ──
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-dynamic-delete': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'warn',
      'no-self-compare': 'error',
      'no-useless-rename': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      // ── 基础规则 ──
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-throw-literal': 'error'
    }
  },
  // JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module'
    }
  },
  // ─── 测试文件宽松规则（必须在 TypeScript files 块之后） ─────────────────────
  {
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/src/tests/**/*.ts',
      '**/tests/**/*.ts'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      // 测试中 mock resolver 常为 async 但不含 await
      '@typescript-eslint/require-await': 'off',
      // 测试中 import 既用作值又用作类型很常见
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/consistent-type-exports': 'off',
      // 测试代码可读性优先
      '@typescript-eslint/prefer-optional-chain': 'off',
      // 产品级新增规则在测试中放宽
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/array-type': 'off',
      'no-self-compare': 'off',
    }
  },
  // ─── Stories 文件宽松规则（必须在 TypeScript files 块之后） ──────────────────
  {
    files: ['**/*.stories.ts', '**/*.stories.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    }
  }
]
