/**
 * @module app:views/features/application/smart-bid/collaboration/tasks/bid-findings-scenario-views
 * 职责：为页15的正式共享场景装配 CheckFinding 数据视图。
 */
import {selectedReviewFindingsView} from '../../authoring/model/review/content-review-findings-reader'
import {bidFindingRegistrationResultView,bidFindingRegistrationView} from './bid-finding-registration-reader'
import {bidFindingRecheckResultView,bidFindingRecheckView} from './bid-finding-recheck-reader'

/** 正式主键由已登记模型供给。 */
export function bidFindingsScenarioViews(primaryKey:string){
 return {
  selectedReviewFindings:selectedReviewFindingsView(),
  originalCompletedCheck:bidFindingRegistrationView(primaryKey),
  originalFindingRegistration:bidFindingRegistrationResultView(primaryKey),
  originalRecheckFinding:bidFindingRecheckView(primaryKey),
  originalRecheckResult:bidFindingRecheckResultView(primaryKey),
 }
}
