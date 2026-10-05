import type { AssignmentEngineTransitionPlan } from './assignmentEngine';

export interface AssignmentPublicationRowLike {
  id: string;
}

export interface AssignmentPublicationPlanLike {
  row: AssignmentPublicationRowLike;
  enginePlan: AssignmentEngineTransitionPlan;
}

export function collectPublishedAssignmentIds(
  draftRows: AssignmentPublicationRowLike[],
  approvalPlans: AssignmentPublicationPlanLike[]
) {
  const ids = new Set<string>();

  for (const row of draftRows) {
    ids.add(row.id);
  }

  for (const plan of approvalPlans) {
    ids.add(plan.row.id);
    for (const update of plan.enginePlan.updates) {
      ids.add(update.id);
    }
  }

  return Array.from(ids);
}
