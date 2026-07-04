import ExcelJS from 'exceljs';
import type { ReportCellStatus, ReportDay, WeeklyReportResponse } from '@/core/api/types';

const days: Array<{ key: ReportDay; label: string }> = [
  { key: 'monday', label: 'Lunes' }, { key: 'tuesday', label: 'Martes' }, { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' }, { key: 'friday', label: 'Viernes' }, { key: 'saturday', label: 'Sábado' },
];
const statusLabels: Record<ReportCellStatus, string> = { TAKEN: '✓', MISSING: '✕', FUTURE: '○', NOT_SCHEDULED: '—', UNKNOWN_SCHEDULE: '?' };

export async function exportReportExcel(report: WeeklyReportResponse): Promise<void> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Presencia · UAT'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Semana ${report.data.week.isoWeek}`, { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.mergeCells('A1:J1'); sheet.getCell('A1').value = 'FACULTAD DE INGENIERÍA TAMPICO · Reporte semanal de asistencia'; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  sheet.mergeCells('A2:J2'); sheet.getCell('A2').value = `${report.data.teacher.name} · Semana ${report.data.week.isoWeek} (${report.data.week.start} a ${report.data.week.end})`;
  sheet.addRow([]); sheet.addRow(['Hora', 'Materia', 'Grupo', 'Salón', ...days.map((day) => day.label)]);
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };
  for (const reportRow of report.data.rows) {
    const row = sheet.addRow([reportRow.startTime && reportRow.endTime ? `${reportRow.startTime}-${reportRow.endTime}` : reportRow.rawSchedule, reportRow.subject, reportRow.groupCode, reportRow.classroom || '—', ...days.map((day) => statusLabels[reportRow.cells[day.key].status])]);
    days.forEach((day, index) => styleStatusCell(row.getCell(index + 5), reportRow.cells[day.key].status));
  }
  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 14 }, { width: 14 }, ...days.map(() => ({ width: 13 }))];
  const buffer = await workbook.xlsx.writeBuffer(); download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename(report, 'xlsx'));
}

function styleStatusCell(cell: ExcelJS.Cell, status: ReportCellStatus): void {
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.font = { bold: true, size: 13, color: { argb: status === 'TAKEN' ? 'FF16A34A' : status === 'MISSING' ? 'FFDC2626' : 'FF64748B' } };
}
function filename(report: WeeklyReportResponse, extension: string) { return `asistencia-${report.data.teacher.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-semana-${report.data.week.isoWeek}.${extension}`; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
