# G3 root review — frozen first implementation

Verdict: Needs revision. 25/25 targeted tests pass, but the component mock changes the real polling contract and important promised behavior is absent.

Snapshot: component EC34B759E378B454C67340C37D68ECD0965BF0D6BF1E07D139EB169C9D87948F; capability EF687A5ABE43DC89A2FED93794A4AE15F6D8073C50453DEFE82AD6C5566E2522; host A4F38C33DB6E7CE2CCB63CF4D513B60DCBABAE77AA631A75EFD6F1B45EB13CD7; component test 2BACFB55A37593D067D2A4BF1776F9FF39AEBB9601005EA6A2F7F880A059776C; host test D9B90E7FFD2A8F01A1778DE7B429692A460C41912FF1790540B2EC9AB7EE741D.

## R1 — important: polling failure never pauses with the real session

SparkAiDataEntry.vue scheduleRefresh/pollOnce (136-153) only checks shouldAutoRefresh and busy, then catches refresh rejection without retaining pause/error and always schedules again. Real AiDataEntrySession.shouldAutoRefresh is a formal-turn hint; it does not stop for a query error. The component test fixture instead makes shouldAutoRefresh false when error is nonempty and sets autoRefresh=false on failure (test lines 82-89), so its GREEN conceals the defect.

Correct the fixture to the real hint contract or use a real session/HTTP fixture. A failed automatic query must stop further automatic requests, including after detach/reattach, and show the existing session/view error. Only an explicit query resumes. Do not silently swallow an unexpected rejection that provides no owner error; show it locally and pause that attachment. Keep one in-flight query. Prefer original session.error/loadingError as persistent evidence; do not build a second remote-turn status cache or change G2b hint merely to satisfy this component test.

## R2 — important: changed binding continues to operate the old target

Component only calls connect from onMounted (213). It neither watches dataViewKey nor rejects local two-part keys before PageRuntime.resolveView, which accepts a local key with a mainScenarioId. A mounted component whose key changes still displays/actions the old session while its declared target is new. run/poll completion also has no attachment-generation guard for local error and scheduling updates.

Require the complete parsed key. On binding/runtime change detach the old UI attachment without disposing its host state, attempt the exact new target through the host gate, and never render/action the old target as the new one. Dirty/unknown host rejection must preserve its original session/capture; reverting to the old key can reattach it. Capture the current attachment for async actions, ignore stale UI updates, and cancel old timers/subscriptions. Add real property-change tests and a delayed old-result test; a separately mounted wrong-key case is insufficient.

## R3 — important: standard component binding/toolbar and disabled-input contract incomplete

The approved contract requires RendererTable.toolbar.children, standard read-only turn DataView binding, and the existing busy/disabled interaction lock. The current component renders a hand-built action div with SparkComponentRenderer buttons lacking dataViewKey (37-39,194-210), displays status only as a span getter, and leaves FieldTextarea editable when disabled/busy/nonterminal (26-34).

Use standard toolbar children on the candidate RendererTable and bind each action to its actual input/turn/target/candidate view as appropriate. Add a read-only RendererForm/field children bound to the exact turn view for status/error. Lock the business prompt through standard readonly/disabled semantics while the session blocksWorkspace or the component is disabled. Keep only businessPrompt user-editable. Verify real UI input remains unchanged while blocked, actual standard toolbar placement, status binding, and candidate read-only rows. Do not change the standard form/table implementations to pass this task.

## R4 — important: partial attachment setup failure leaves a live lease

After openSession returns the matching target, connect stores attachment/session before resolving the Input/Candidates keys and subscribing (172-175). If a derived view cannot resolve, catch only sets localError. The matching lease remains active and may block subsequent connections, and UI can partially render.

On failure after accepting a matching lease, remove local observers/timers and detach only that accepted attachment, retaining the host session and any intent. Do not detach a returned mismatched-target lease belonging to another owner. Add the post-attach missing/misbound semantic-view case and verify clean retry is possible.

## Additional engineering gate issues reported by the writer

- scoped ESLint: host prefer-optional-chain at old line85.
- verify:ai-codegen: new ImportMetaEnv interface isn't an allowed interface; inspect existing declaration conventions and use the permitted project form.
- verify:ai-codegen: Object.create(null) as Record is a forbidden assertion; use a typed/validated construction consistent with repository rules.
- typecheck started but no retained completion/session ID; there is no success evidence.

Fix round1 must keep product scope to the approved G3 files. First save behavior RED for the above defects; then fix, run both scoped files and the affected gates, freeze and report. Formal generation happens only after source/JSDoc freeze. Do not edit previous generated artifacts manually. The preflight-before-abort host fix is already present and has recorded behavior RED; preserve it.
