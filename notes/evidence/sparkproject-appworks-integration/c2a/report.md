# C2a 实施报告

## 结果

C2a 12 文件范围内完成系统页固定 host、scope/path owner 身份解析、菜单真实 node marker、meta 投影、landing/home fallback 与错误闭环。菜单按 Router 实际解析出的 identity host 决定是否附加 marker；page routeKind（包括 itemKind 缺省 page）传真实 node id。保留键只在 identity host 实际菜单 push 分支拒绝，普通 cfg 行为不受此检查影响。碰撞 Router fixture 限于新增 scope 测试。

## RED/GREEN 与门禁证据

本目录保留每个行为子点真实 RED/GREEN 日志及配套 result JSON。代表性闭环：`canonical-query-red/green2`、`hash-query-red/green`、`reserved-target-red/green`、`host-owner-meta-red/green`、`tenant-project-red/green2`、`mapped-page-kind-red` + `host-selection-green`、`menu-identity-red/green`、`menu-scope-selection-red` + `host-selection-green`。

最终门禁（日志含实际 stdout/stderr，result JSON 含命令、cwd、时间、exitCode）：

- `focused-final2`: auth-nav 4 文件，4 suites / 77 tests 通过，exit 0。
- `typecheck-final2`: `pnpm run typecheck` 通过，exit 0。
- `lint-final2`: 8 个生产文件 ESLint 通过，exit 0。
- `spark-app-final`: 首次包级 Vitest 11 suites / 77 tests 通过，但 1 suite 无法加载新增 .vue host，exit 1。后续主控裁决批准在既有13文件范围补包 Vitest Vue 插件，见下方补充闭环；此首次失败已解决。

早期门禁修正记录保留：`typecheck-final` 因 resolver query 的 undefined 类型失败，`lint-final` 因动态 delete 失败；修复后对应最终门禁均通过。没有执行根 build 或浏览器验收，由主控负责。

## 初始实施阶段 SHA-256（补充闭环前快照；最终值见后文）

```
packages/spark-app/src/navigation/runtime-navigation.ts 8914C92B3D7AF31766F65022E37F7500DF8625CE0F333124DFCC20B3DE45550F
packages/spark-app/src/index.ts BCAEE40F54E29C4FF6CA2E944A13AD9D09545C4998CB5CBB296783E41389406D
packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts 6317CF15E7E9E53AA96243F64B9941CC1A2C761B7CCD4F479697F9365899B65A
packages/spark-app/src/router/system-page-identity/system-page-route-host.vue BB3118B42D0C26BEA440C11D8DEDB3DC95E39F24635D1091E8A97E9C35712761
packages/spark-app/src/router/dynamic.ts D4BA20D9855B29DE9C07EAD574B68D8A82AAEE2F03999576F0369FB815E88504
packages/spark-app/src/navigation/useNavigation.ts CFE3C43D3D30B0F6E13E7EBDD1C3B25F3A67CBDB11DDA848171FFF34F4DC55A1
src/lowcode/lowcode-runtime.ts 17460A556BF95A4B30285AEB9DA5613F252F28741094E1F08DF608440C4B5376
src/main.ts 9FD7F096510ADB1C87B3DCAED9A58B38DC725322BB4E21463A30D5CEC2D748D8
tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts 898D1CDB953B69218A2B1D1C5C10B45BF34808D0D149B622F10EAC433ABDFCEA
tests/auth-nav/dynamic-router-platform-pages.test.ts 779FF43E0DDE1A09A16EB1CAC05231D6AC6A7B1026EC849A238F4EFEFEBF9F82
tests/runtime/auth-nav/navigation-platform-paths.test.ts 97A1D2A9E0D2893AEC85A1AB9EAF734463C4F1522A99A3C290DC38F936C4AFD7
tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts 1A90EBA646DA19B189A162D80819617D1AA55DF0CCAE48A1F55047112238A044
```

## 包级 Vitest Vue 转换补充闭环

主控裁决批准第13文件 `packages/spark-app/vitest.config.ts` 使用已安装的 `@vitejs/plugin-vue`，不改依赖或 lockfile。`vue-config-red-green.log` 记录补配置后原失败 `dynamic-auth-fallback` suite 3/3 通过；`spark-app-package-tests-final` 记录包级全量 12 suites / 80 tests 通过。包 typecheck、root typecheck、C2a 八个生产文件 scoped lint、`verify:dirs` 均 exit 0，日志和 result JSON 均在本目录。Vitest config 原被根 ESLint ignore（`eslint.config.js` 明确包含 `packages/**/vitest.config.ts`），故其 ESLint 记为 N/A；单文件 `tsc --ignoreConfig ... packages/spark-app/vitest.config.ts` 通过。

`verify:ai-codegen` 首次发现 C2a 新增的私有字段 `systemPageIdentityResolver: SystemPageIdentityResolver` 违反仓库命名规则。经主控批准，将该字段及所有 `this` 引用局部更名为 `systemPages`，类型及行为不变。原失败 suite 再次 3/3 通过，`ai-codegen-after-fix` 扫描 973 文件通过。最终 SHA-256（本轮锁定目标13文件）：

```text
packages/spark-app/src/navigation/runtime-navigation.ts 8914C92B3D7AF31766F65022E37F7500DF8625CE0F333124DFCC20B3DE45550F
packages/spark-app/src/index.ts BCAEE40F54E29C4FF6CA2E944A13AD9D09545C4998CB5CBB296783E41389406D
packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts 6317CF15E7E9E53AA96243F64B9941CC1A2C761B7CCD4F479697F9365899B65A
packages/spark-app/src/router/system-page-identity/system-page-route-host.vue BB3118B42D0C26BEA440C11D8DEDB3DC95E39F24635D1091E8A97E9C35712761
packages/spark-app/src/router/dynamic.ts FB2AE374119F2F5C280D16B1343D21ABBEBF1C9E80893E7EBCD9F8150BF40346
packages/spark-app/src/navigation/useNavigation.ts CFE3C43D3D30B0F6E13E7EBDD1C3B25F3A67CBDB11DDA848171FFF34F4DC55A1
src/lowcode/lowcode-runtime.ts 17460A556BF95A4B30285AEB9DA5613F252F28741094E1F08DF608440C4B5376
src/main.ts 9FD7F096510ADB1C87B3DCAED9A58B38DC725322BB4E21463A30D5CEC2D748D8
tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts 898D1CDB953B69218A2B1D1C5C10B45BF34808D0D149B622F10EAC433ABDFCEA
tests/auth-nav/dynamic-router-platform-pages.test.ts 779FF43E0DDE1A09A16EB1CAC05231D6AC6A7B1026EC849A238F4EFEFEBF9F82
tests/runtime/auth-nav/navigation-platform-paths.test.ts 97A1D2A9E0D2893AEC85A1AB9EAF734463C4F1522A99A3C290DC38F936C4AFD7
tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts 1A90EBA646DA19B189A162D80819617D1AA55DF0CCAE48A1F55047112238A044
packages/spark-app/vitest.config.ts 07FF29FB8F5A7530CF8A2E65BA4C16D5B33BFE8D1BC45C52893285517263BEC7
```

