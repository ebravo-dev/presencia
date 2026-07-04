import ExcelJS from 'exceljs';
import type { WeeklyReportResponse } from '@/core/api/types';

const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday'] as const;
const dayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves'];
const statusLabels: Record<string, string> = { TAKEN: 'Tomada', MISSING: 'Pendiente', FUTURE: 'Futura', NOT_SCHEDULED: 'Sin clase', UNKNOWN_SCHEDULE: 'Horario inválido' };

export async function exportReportExcel(report: WeeklyReportResponse): Promise<void> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Presencia · UAT'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Semana ${report.data.week.isoWeek}`, { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.mergeCells('A1:H1'); sheet.getCell('A1').value = 'UAT · FI Tampico — Reporte semanal de asistencia'; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  sheet.mergeCells('A2:H2'); sheet.getCell('A2').value = `${report.data.teacher.name} · Semana ${report.data.week.isoWeek} (${report.data.week.start} a ${report.data.week.end})`;
  sheet.addRow([]); sheet.addRow(['Hora', 'Materia', 'Grupo', 'Salón', ...dayLabels]);
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };
  for (const row of report.data.rows) sheet.addRow([row.startTime && row.endTime ? `${row.startTime}-${row.endTime}` : row.rawSchedule, row.subject, row.groupCode, row.classroom || '—', ...dayKeys.map((day) => statusLabels[row.cells[day].status])]);
  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 14 }, { width: 14 }, ...dayKeys.map(() => ({ width: 16 }))];
  const buffer = await workbook.xlsx.writeBuffer(); download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename(report, 'xlsx'));
}

function filename(report: WeeklyReportResponse, extension: string) { return `asistencia-${report.data.teacher.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-semana-${report.data.week.isoWeek}.${extension}`; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
