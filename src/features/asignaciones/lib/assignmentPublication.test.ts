import { describe, expect, it } from 'vitest';
import { collectPublishedAssignmentIds } from './assignmentPublication';

describe('collectPublishedAssignmentIds', () => {
  it('incluye el lote aprobado y cualquier fila previa modificada por el motor', () => {
    const ids = collectPublishedAssignmentIds(
      [{ id: 'draft-1' }, { id: 'draft-2' }],
      [
        {
          row: { id: 'draft-1' },
          enginePlan: {
            ignoredComparableIds: [],
            updates: [
              { id: 'existing-1', patch: { estado_publicacion: 'BORRADOR' } },
              { id: 'existing-2', patch: { fecha_fin: '2026-04-30' } },
            ],
            continuationInsert: null,
          },
        },
        {
          row: { id: 'draft-2' },
          enginePlan: {
            ignoredComparableIds: [],
            updates: [{ id: 'existing-1', patch: { observaciones: 'AUTO' } }],
            continuationInsert: null,
          },
        },
      ]
    );

    expect(ids).toEqual(['draft-1', 'draft-2', 'existing-1', 'existing-2']);
  });
});
