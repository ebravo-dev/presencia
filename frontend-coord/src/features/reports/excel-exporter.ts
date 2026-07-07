import ExcelJS from 'exceljs';
import type { AttendanceReportResponse, RangeReportResponse, ReportCellStatus, ReportDay, WeeklyReportResponse } from '@/core/api/types';

const days: Array<{ key: ReportDay; label: string }> = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
];

const statusLabels: Record<ReportCellStatus, string> = {
  TAKEN: '✓',
  MISSING: '✕',
  FUTURE: '○',
  NOT_SCHEDULED: '—',
  UNKNOWN_SCHEDULE: '?',
  SOURCE_UNAVAILABLE: '!',
};

export async function exportReportExcel(report: AttendanceReportResponse): Promise<void> {
  if (isRangeReport(report)) {
    await exportRangeReportExcel(report);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Presencia · UAT';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Semana ${report.data.week.isoWeek}`, { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'FACULTAD DE INGENIERÍA TAMPICO · Reporte semanal de asistencia';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = `${report.data.teacher.name} · Semana ${report.data.week.isoWeek} (${report.data.week.start} a ${report.data.week.end})`;

  sheet.addRow([]);
  sheet.addRow(['Hora', 'Materia', 'Grupo', 'Salón', 'Ciclo', ...days.map((day) => day.label), 'Cumplimiento']);
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };

  for (const reportRow of report.data.rows) {
    const row = sheet.addRow([
      reportRow.startTime && reportRow.endTime ? `${reportRow.startTime}-${reportRow.endTime}` : reportRow.rawSchedule,
      reportRow.subject,
      reportRow.groupCode,
      reportRow.classroom || '—',
      reportRow.period,
      ...days.map((day) => statusLabels[reportRow.cells[day.key]?.status ?? 'NOT_SCHEDULED']),
      formatRate(reportRow.completionRate),
    ]);

    days.forEach((day, index) => styleStatusCell(row.getCell(index + 6), reportRow.cells[day.key]?.status ?? 'NOT_SCHEDULED'));
    const rateCell = row.getCell(days.length + 6);
    rateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rateCell.font = { bold: true, color: { argb: reportRow.completionRate == null ? 'FF64748B' : 'FFC8102E' } };
  }

  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 14 }, { width: 14 }, { width: 16 }, ...days.map(() => ({ width: 13 })), { width: 14 }];
  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename(report, 'xlsx'));
}

async function exportRangeReportExcel(report: RangeReportResponse): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Presencia · UAT';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Rango', { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').value = 'FACULTAD DE INGENIERIA TAMPICO · Reporte de asistencia por rango';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = `${report.data.teacher.name} · ${report.data.range.start} a ${report.data.range.end}`;

  sheet.addRow([]);
  sheet.addRow(['Materia', 'Horario', 'Salón', 'Ciclo', 'Grado', 'Grupo', 'Dias de clase en el periodo', 'Dias de clase reportados', 'Porcentaje de asistencia']);
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };

  for (const reportRow of report.data.rows) {
    const row = sheet.addRow([
      reportRow.subject,
      reportRow.rawSchedule || 'Sin horario',
      reportRow.classroom || '—',
      reportRow.period,
      reportRow.grade || '-',
      reportRow.groupCode || '-',
      reportRow.scheduledClassDays,
      reportRow.reportedClassDays,
      formatRangeRate(reportRow.attendanceRate),
    ]);

    row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(9).font = { bold: true };
    if (reportRow.attendanceRate === 0) {
      row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      row.getCell(9).font = { bold: true, color: { argb: 'FF000000' } };
    }
  }

  sheet.columns = [{ width: 38 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 24 }, { width: 24 }, { width: 22 }];
  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rangeFilename(report, 'xlsx'));
}

function styleStatusCell(cell: ExcelJS.Cell, status: ReportCellStatus): void {
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.font = {
    bold: true,
    size: 12,
    color: {
      argb: status === 'TAKEN' ? 'FF16A34A' : status === 'MISSING' ? 'FFDC2626' : status === 'SOURCE_UNAVAILABLE' ? 'FFD97706' : 'FF64748B',
    },
  };
}

function formatRate(value: number | null | undefined) {
  return value == null ? 'N/D' : `${value}%`;
}

function formatRangeRate(value: number | null | undefined) {
  return value == null ? 'N/D' : `${value.toFixed(2)}%`;
}

function isRangeReport(report: AttendanceReportResponse): report is RangeReportResponse {
  return 'range' in report.data;
}

function filename(report: WeeklyReportResponse, extension: string) {
  return `asistencia-${report.data.teacher.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-semana-${report.data.week.isoWeek}.${extension}`;
}

function rangeFilename(report: RangeReportResponse, extension: string) {
  return `asistencia-${report.data.teacher.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${report.data.range.start}-a-${report.data.range.end}.${extension}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
