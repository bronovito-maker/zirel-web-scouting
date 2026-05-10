import { Lead } from "../models.js";

export function rankLeads(leads: Lead[]): Lead[] {
  const priorityOrder: Record<string, number> = {
    SUPER_HOT: 0,
    HOT: 1,
    WARM: 2,
    SKIP: 3
  };
  return [...leads].sort((a, b) => {
    const ao = priorityOrder[a.callPriority] ?? 99;
    const bo = priorityOrder[b.callPriority] ?? 99;
    if (ao !== bo) return ao - bo;
    if (a.salesEaseScore !== b.salesEaseScore) return b.salesEaseScore - a.salesEaseScore;
    if (a.buyerFitScore !== b.buyerFitScore) return b.buyerFitScore - a.buyerFitScore;
    if (a.reviewsCount !== b.reviewsCount) return b.reviewsCount - a.reviewsCount;
    if (a.moneyOpportunityScore !== b.moneyOpportunityScore) return b.moneyOpportunityScore - a.moneyOpportunityScore;
    if (a.zirelProblemScore !== b.zirelProblemScore) return b.zirelProblemScore - a.zirelProblemScore;
    if (a.finalPriorityScore !== b.finalPriorityScore) return b.finalPriorityScore - a.finalPriorityScore;
    return b.fitScore - a.fitScore;
  });
}
