# RendererTable cancelled current-change static review

## Conclusion

`_isRestoringCurrentRow` is not itself a callback loop: Element Plus `setCurrentRow` synchronously commits and emits `current-change` (`node_modules/element-plus/es/components/table/src/table/utils-helper.mjs:3-5`; `store/current.mjs:24-35`), while the guard is true around that call (`RendererTable.vue:451-455`). Its event handler returns before dispatch (`RendererTable.vue:442`). Therefore the high-CPU hang is not explained by the restoration call repeatedly re-entering the callback.

There is, however, a reachable stale-event correctness gap in the dynamic-key test. Element Plus `setData` calls `updateCurrentRowData` on a changed table data array (`node_modules/element-plus/es/components/table/src/store/index.mjs:32-36`). When the old highlighted row is not in the newly bound view's row objects and no `rowKey` is configured, Element Plus emits `current-change(null, oldRow)` (`store/current.mjs:36-45`). `RendererTable.handleCurrentChange` dispatches that event against the *currently resolved* view, and the zero-code default also dereferences the current `resolvedView` when it runs (`RendererTable.vue:441-456`; `RendererTable/zero-code.ts:117-123`). Thus a native row-reset event from switching `default` to `other` can clear `other.currentRow`, despite the old event belonging to the previous binding. This is not a fixture-only artifact: both views contain distinct row objects from separate query results, which is a valid runtime shape.

## Narrow recommendation

Associate native current-change handling with the rendered binding/data generation. Ignore a null/reset event when its `oldCurrentRow` does not belong to the currently bound view's rows; likewise reject a non-null `currentRow` not in that view's rows. Keep normal user clear/select events whose rows belong to the current view. This avoids introducing a global callback-count contract and prevents data replacement from being interpreted as a user selection on the new view. The existing restore guard can remain for the synchronous programmatic `setCurrentRow` call.

The focused test should assert: pending cancelled O2 event switches binding; new view's pre-existing O1 selection remains; the stale reset is not dispatched as a new-view selection; a genuine user clear/select on the new view still follows the standard default action. Do not require one total callback for all programmatic events.

## Why the test may stall

The callback is intentionally asynchronous and changes the binding from inside `onCurrentChange` (`tests/ui/renderer/data-table/renderer-table-auto-columns.test.ts:326-354`). That race is a useful regression case, but static source does not establish the reported high-CPU cause. Because Element Plus emits replacement events synchronously and their Vue handlers return promises that the emitter does not await, a test that awaits the click and then repeatedly flushes promise queues can obscure which of the overlapping old-row/reset handlers is still pending. A bounded deferred promise plus explicit `nextTick`/promise resolution checkpoints would make the interleaving observable without treating every native callback as a failure.
