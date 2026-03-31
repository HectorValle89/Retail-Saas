import { NextResponse } from 'next/server'
import {
  buildCampaignProductQuotaTemplateWorkbook,
  getCampaignProductQuotaTemplateFilename,
} from '@/features/campanas/lib/campaignProductQuotaTemplate'

export async function GET() {
  const workbook = buildCampaignProductQuotaTemplateWorkbook()
  const filename = getCampaignProductQuotaTemplateFilename()

  return new NextResponse(workbook, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
