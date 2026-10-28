# Relation test identity RED evidence

Source: main-agent report before this scoped test-fixture correction, from an independent `table-and-view-page.test.ts` run.

```text
72 passed / 5 failed
Four relation add/cancel scenarios threw DATA_VIEW_NEW_ROW_IDENTITY_REQUIRED because setup passed rowid as an ordinary field to DataView.addRow; the test rows must use addRowWithIdentity({field: 'rowid', value}, fields).
The fifth failure was the table-copy case and is tracked separately in database-copy-permission-preflight-red.txt.
```

There are five direct `relationView.addRow({rowid: ...})` calls across four test scenarios (one scenario prepares two rows). This evidence records the reported pre-fix run; it is not a newly reproduced RED run. After correcting the setup calls, the targeted five scenarios passed, and the complete page test file passed 77/77.
