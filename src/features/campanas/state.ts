import type { CampaignRotationImpactPreview } from './lib/campaignRotationImpact'

export interface CampanaAdminActionState {
  ok: boolean
  message: string | null
  requiresRotationReview?: boolean
  rotationImpactPreview?: CampaignRotationImpactPreview | null
}

export const ESTADO_CAMPANA_ADMIN_INICIAL: CampanaAdminActionState = {
  ok: false,
  message: null,
  requiresRotationReview: false,
  rotationImpactPreview: null,
}
