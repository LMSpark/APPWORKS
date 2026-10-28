# PlatformApps DataView migration evidence (2026-10-28)

- `vitest-platform-and-switching.log`: 3 focused files, all passing (PlatformApps DataView integration, AppList DataView integration, and app switching). PlatformApps tests cover formal catalog binding, no legacy `listApplications` call, initial and user-triggered refresh, current switch receipt checks, stale-receipt navigation rejection, optional `IsSys` type/delete behavior including missing/null/unreadable values, query failure display, and disposal after an in-flight query completes post-unmount. The application-switch test uses a row-action probe matching the RendererList child contract to retain its current/stale receipt assertions.
- `eslint.log`: scoped ESLint for the changed page and test files.
- `diff-check.log`: `git diff --check`.
