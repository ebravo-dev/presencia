import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WeeklyReportResponse } from '@/core/api/types';

const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday'] as const;
const dayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves'];
const statusLabels: Record<string, string> = { TAKEN: 'Tomada', MISSING: 'Pendiente', FUTURE: 'Futura', NOT_SCHEDULED: 'Sin clase', UNKNOWN_SCHEDULE: 'Horario inválido' };

export function exportReportPdf(report: WeeklyReportResponse): void {
  const doc = new jsPDF({ orientation: 'landscape' }); doc.setFillColor(17, 17, 17); doc.rect(0, 0, 297, 28, 'F'); doc.setTextColor(255); doc.setFontSize(17); doc.text('UAT · FI Tampico', 14, 12); doc.setFontSize(10); doc.text('Reporte semanal de asistencia docente', 14, 20);
  doc.setTextColor(17); doc.setFontSize(12); doc.text(report.data.teacher.name, 14, 38); doc.setFontSize(9); doc.setTextColor(80); doc.text(`Semana ${report.data.week.isoWeek} · ${report.data.week.start} a ${report.data.week.end} · Cumplimiento ${report.data.summary.completionRate}%`, 14, 44);
  autoTable(doc, { startY: 50, head: [['Hora', 'Materia', 'Grupo', 'Salón', ...dayLabels]], body: report.data.rows.map((row) => [row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : row.rawSchedule, row.subject, row.groupCode, row.classroom || '—', ...dayKeys.map((day) => statusLabels[row.cells[day].status])]), styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [200, 16, 46] }, alternateRowStyles: { fillColor: [248, 250, 252] } });
  doc.setFontSize(8); doc.setTextColor(100); doc.text(`Generado ${new Date(report.meta.generatedAt).toLocaleString('es-MX')} · Zona horaria ${report.meta.timezone}`, 14, 200); doc.save(filename(report));
}

function filename(report: WeeklyReportResponse) { return `asistencia-${report.data.teacher.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-semana-${report.data.week.isoWeek}.pdf`; }
