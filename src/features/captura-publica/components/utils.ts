export function sortAndFormatDermoconsejeras(
  empleados: Array<{ id: string; nombre: string }>,
  assignedEmpleadoIds: Set<string>
) {
  const assigned: Array<{ value: string; label: string }> = [];
  const remaining: Array<{ value: string; label: string }> = [];

  for (const emp of empleados) {
    if (assignedEmpleadoIds.has(emp.id)) {
      assigned.push({
        value: emp.id,
        label: `📌 ${emp.nombre} (Programada hoy)`,
      });
    } else {
      remaining.push({
        value: emp.id,
        label: emp.nombre,
      });
    }
  }

  return [{ value: '', label: 'Elige la dermoconsejera' }, ...assigned, ...remaining];
}
