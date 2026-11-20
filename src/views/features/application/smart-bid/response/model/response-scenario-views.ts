/**
 * @module app:views/features/application/smart-bid/response/model/response-scenario-views
 * 职责：按正式模型组织页10原报价、分项、担保和答复分工视图。
 */
import {approvedPriceReadView} from './approved-price-reader'
import {bidSecurityRequirementView} from './bid-security-reader'
import {priceSheetReadView} from './price-sheet-reader'
import {responseAssignmentReadView} from './response-assignment-reader'

/** 共享场景只挂视图，字段与正式主键由已登记模型提供。 */
export function responseScenarioViews(primaryKeys:Readonly<Record<'ApprovedPrice'|'BidSecurity'|'PriceSheet'|'ResponseAssignment',string>>){
 return {
  ApprovedPrice:{selectedApprovedPrice:approvedPriceReadView(primaryKeys.ApprovedPrice)},
  BidSecurity:{selectedSecurityRequirement:bidSecurityRequirementView(primaryKeys.BidSecurity)},
  PriceSheet:{selectedPriceSheet:priceSheetReadView(primaryKeys.PriceSheet)},
  ResponseAssignment:{selectedResponseAssignment:responseAssignmentReadView(primaryKeys.ResponseAssignment)},
 }
}
