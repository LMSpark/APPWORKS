# ProjectPlanning DataView input slice audit (2026-10-28)

## Status

Blocked before implementation. No source or test edits made. The current inline DevSystem input path already reads the actual runtime DataView once, validates its project scope/tree projection, and synchronizes the tree into `ProjectWorkspace`; `buildProjectPlanningAgentInput()` then uses the domain model's projection methods. This is an in-memory projection, not evidence of a duplicate remote query. Removing it safely would require preserving several distinct input sources/contracts that the current formal `Base_NavigationInfo` DataView does not fully expose.

## Evidence

- The unique ledger says the active inline path uses the DevSystem `BlueprintWorkspaceDataView`; the headless provider independently creates a PageRuntime/DataSet and currently disposes its owner before Agent execution. It also states the headless preparer has no confirmed production caller. See `notes/data-space-retirement-ledger.md:69` and historical details at `:1017`.
- Inline `runProjectPlanningAiSession()` calls `synchronizeProjectPlanningTreeFromDataView(editor.project, dataViewOwner)` and then builds input from `editor.project` (`src/services/project-planning/project-planning-ai-runner.ts:95-96`). It passes that same live owner to the workflow for guarded commands (`:114`).
- Synchronization checks matching project identity, complete tree loaded, no dirty/pending state, and replaces the domain tree with `owner.treeProjection()` (`src/services/project-planning/project-planning-agent-workflow-binding.ts:300-310`). This uses the current authorized DataView result and does not query again.
- The project's short requirement is not solely a navigation row value: `ProjectBlueprint.readProjectPlanningInput()` chooses root description, then falls back to `this.description`; attachment reference prefers root `source.planningAttachmentRef` and then `projectInfo.planningAttachmentRef` (`packages/spark-project-model/src/project/project-blueprint.ts:175-185`). Node inputs are separately projected by `toBlueprintPlanningInput()` (`:663-672`).
- The DataView projection converts `memo` to node `description` (`src/services/project/blueprint-workspace-dataview.ts:933`) and only selects a fixed allowlisted set of row fields in `projectedRecords()` (`:1060-1084`); `planningAttachmentRef` is absent from that list. Project-level `description` and `projectInfo.planningAttachmentRef` are also not Base_NavigationInfo row members in this owner contract.
- `resolveProjectPlanningRunInput()` delegates input semantics to `ProjectBlueprint.readProjectPlanningInput()` and `readBlueprintPlanningInputs()` before applying overrides/scoping (`src/services/project-planning/project-planning-agent-workflow-binding.ts:141-185`, `:255-296`).

## Exact blocker / next gate

There is no proven semantic equivalence for an input builder that consumes only the current DataView: project-level description fallback and attachment reference come from `ProjectWorkspace` project metadata; node attachment references are not included in the DataView's explicit output projection. Do not fabricate a DataView field, widen outputs, infer attachment references, or replace the project fallback behavior.

To reopen a safe implementation slice, first establish (from the actual formal DataView metadata/query result and existing persisted contracts) whether `planningAttachmentRef` is a visible authorized output for navigation rows, and define the supported source for project-level `description` / `projectInfo.planningAttachmentRef`. Then specify equivalence tests for root-description precedence, project-description fallback, attachment precedence, node input projection, and scoped filtering. Until then, retain the existing single-query DataView-to-domain projection path.

## Verification

No tests run: the semantic precondition for a safe behavior-preserving cut was not met. No backend Java, ledger, formal data, commit, or push changes.
