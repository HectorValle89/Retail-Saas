export const runtime = 'edge';
import { NextResponse } from 'next/server'
import {
  buildMessageSurveyTemplateWorkbook,
  getMessageSurveyTemplateFilename,
} from '@/features/mensajes/lib/messageSurveyTemplate'

export async function GET() {
  const buffer = buildMessageSurveyTemplateWorkbook()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${getMessageSurveyTemplateFilename()}"`,
      'Cache-Control': 'no-store',
    },
  })
}

