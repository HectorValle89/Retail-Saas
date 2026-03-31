import { describe, expect, it } from 'vitest'
import {
  createVisitTaskTemplateItem,
  ensureVisitTaskSession,
  getPendingVisitTaskLabels,
  getPendingCampaignTasks,
  inferVisitTaskKind,
  mergeCampaignEvidenceEntries,
  readCampaignEvidenceEntries,
  updateVisitTaskSession,
  visitTaskRequiresPhoto,
  type CampaignEvidenceEntry,
} from './campaignProgress'

function buildEntry(partial: Partial<CampaignEvidenceEntry> = {}): CampaignEvidenceEntry {
  return {
    url: 'https://example.com/evidencia.jpg',
    hash: 'hash-1',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    thumbnailHash: 'thumb-hash-1',
    uploadedAt: '2026-03-17T10:00:00.000Z',
    uploadedBy: 'user-1',
    asistenciaId: 'asistencia-1',
    fileName: 'evidencia.jpg',
    mimeType: 'image/jpeg',
    officialAssetKind: 'optimized',
    taskKey: 'task-1',
    capturedAt: '2026-03-17T10:00:00.000Z',
    latitude: 19.4326,
    longitude: -99.1332,
    cameraCaptured: true,
    timestampStamped: true,
    distanceFromCheckInMeters: 12,
    suspicious: false,
    suspiciousReason: null,
    ...partial,
  }
}

describe('campaign progress evidence metadata', () => {
  const buildTemplate = (...labels: string[]) => labels.map((label) => createVisitTaskTemplateItem(label))

  it('reads only valid evidence entries from metadata', () => {
    const entries = readCampaignEvidenceEntries({
      evidencias: [
        buildEntry(),
        { foo: 'bar' },
      ],
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.hash).toBe('hash-1')
  })

  it('deduplicates entries by hash keeping the latest upload payload', () => {
    const existing = [
      buildEntry({
        hash: 'hash-repeat',
        uploadedAt: '2026-03-17T09:00:00.000Z',
        fileName: 'old.jpg',
      }),
      buildEntry({
        hash: 'hash-keep',
        uploadedAt: '2026-03-17T08:00:00.000Z',
      }),
    ]

    const merged = mergeCampaignEvidenceEntries(existing, [
      buildEntry({
        hash: 'hash-repeat',
        uploadedAt: '2026-03-17T11:00:00.000Z',
        fileName: 'new.jpg',
      }),
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]?.hash).toBe('hash-repeat')
    expect(merged[0]?.fileName).toBe('new.jpg')
    expect(merged[1]?.hash).toBe('hash-keep')
  })

  it('returns only the required tasks that are still pending', () => {
    expect(
      getPendingCampaignTasks(['Foto anaquel', 'Conteo inventario', 'Foto anaquel'], ['Conteo inventario'])
    ).toEqual(['Foto anaquel'])
  })

  it('generates a stable variable subset per attendance session', () => {
    const first = ensureVisitTaskSession(
      {},
      {
        attendanceId: 'attendance-1',
        templateTasks: buildTemplate('Foto anaquel', 'Conteo', 'Encuesta', 'Precio'),
        variabilityCount: 2,
        generatedAt: '2026-03-17T10:00:00.000Z',
      }
    ).session

    const second = ensureVisitTaskSession(
      {},
      {
        attendanceId: 'attendance-1',
        templateTasks: buildTemplate('Foto anaquel', 'Conteo', 'Encuesta', 'Precio'),
        variabilityCount: 2,
        generatedAt: '2026-03-17T10:00:00.000Z',
      }
    ).session

    expect(first.tasks).toHaveLength(2)
    expect(first.tasks.map((task) => task.label)).toEqual(second.tasks.map((task) => task.label))
    expect(first.tasks[0]?.kind).toBeTypeOf('string')
  })

  it('tracks completed and justified tasks with timestamps and pending labels', () => {
    const session = ensureVisitTaskSession(
      {},
      {
        attendanceId: 'attendance-2',
        templateTasks: buildTemplate('Foto anaquel', 'Conteo'),
        variabilityCount: 2,
        generatedAt: '2026-03-17T10:00:00.000Z',
      }
    ).session

    const updated = updateVisitTaskSession(
      session,
      [
        { key: session.tasks[0]!.key, status: 'COMPLETADA' },
        { key: session.tasks[1]!.key, status: 'JUSTIFICADA', justification: 'PDV sin acceso a bodega' },
      ],
      '2026-03-17T10:15:00.000Z'
    )

    expect(updated.tasks.every((task) => task.startedAt && task.finishedAt)).toBe(true)
    expect(updated.tasks[1]?.justification).toBe('PDV sin acceso a bodega')
    expect(getPendingVisitTaskLabels(updated)).toEqual([])
  })

  it('marks task kind and suspicious evidence flags when updating a session', () => {
    const session = ensureVisitTaskSession(
      {},
      {
        attendanceId: 'attendance-3',
        templateTasks: buildTemplate('Foto anaquel principal'),
        variabilityCount: 1,
        generatedAt: '2026-03-17T10:00:00.000Z',
      }
    ).session

    expect(inferVisitTaskKind(session.tasks[0]!.label)).toBe('FOTO_ANAQUEL')
    expect(visitTaskRequiresPhoto(session.tasks[0]!.kind)).toBe(true)

    const updated = updateVisitTaskSession(
      session,
      [
        {
          key: session.tasks[0]!.key,
          status: 'COMPLETADA',
          suspicious: true,
          suspiciousReason: 'Coordenadas inconsistentes con el check-in activo.',
          evidenceCountIncrement: 1,
        },
      ],
      '2026-03-17T10:20:00.000Z'
    )

    expect(updated.tasks[0]?.suspicious).toBe(true)
    expect(updated.tasks[0]?.suspiciousReason).toContain('Coordenadas inconsistentes')
    expect(updated.tasks[0]?.evidenceCount).toBe(1)
  })
})
