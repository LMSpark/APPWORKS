# Blueprint workspace delivery suite: primary re-run

Command: `pnpm exec vitest run tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts`

Result: 41 passed, 4 failed, 2 unhandled asynchronous errors.

Failing cases:

- `edits memo from Basic Info through the shared Base_NavigationInfo DataView and global dirty state`: expected the cancelled edit overlay to be `undefined`; received `""`.
- `reuses the DevState-owned DataView when selection clears and is restored`: Vue unmount threw while reading `type` from a null node; an asynchronous `parentNode` error followed.
- `hides unreadable and disables non-writable fields across all NodeBasicInfo panels`: `PAGE_RUNTIME_MISSING` because the test mount did not provide the explicit binding runtime.
- `filters NodeBasicInfo to capability fields while retaining the default full view`: `PAGE_RUNTIME_MISSING` for the same explicit binding runtime requirement.

The test file's production imports only changed to follow the owner move, but this alone does not establish these failures as baseline. A baseline comparison was attempted in a detached worktree; its dependency isolation could not run because `axios` was unresolved, and installing would have targeted shared `node_modules`. The failure classification remains open.
