/** Agrupa procesos por su cola (queue_name). Los que no tienen cola quedan en "loose". */
export default function groupByQueue(procs) {
  const groups = new Map(); // queue_name -> processes[]
  const loose = [];
  for (const p of procs) {
    if (p.queue_name) {
      if (!groups.has(p.queue_name)) groups.set(p.queue_name, []);
      groups.get(p.queue_name).push(p);
    } else {
      loose.push(p);
    }
  }
  return { groups, loose };
}
