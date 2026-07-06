import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import fiuatLogo from '@/assets/fiuat-logo.png';
import type { AttendanceReportResponse, RangeReportResponse, ReportCellStatus, ReportDay, WeeklyReportResponse } from '@/core/api/types';

const days: Array<{ key: ReportDay; label: string }> = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
];

export async function exportReportPdf(report: AttendanceReportResponse): Promise<void> {
  if (isRangeReport(report)) {
    await exportRangeReportPdf(report);
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogo();
  if (logo) doc.addImage(logo, 'PNG', 14, 11, 43, 17);

  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FACULTAD DE INGENIERÍA', 62, 17);
  doc.text('TAMPICO', 62, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Reporte de Asistencia Docente Semanal', 62, 28);
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`Semana: ${formatRange(report.data.week.start, report.data.week.end)}`, 196, 15, { align: 'right' });
  doc.text(`Semana ISO: ${report.data.week.isoWeek}`, 196, 20, { align: 'right' });
  doc.text(`Generado: ${formatDate(report.meta.generatedAt)}`, 196, 25, { align: 'right' });
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(14, 33, 196, 33);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, 38, 182, 20, 'FD');
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Datos del profesor', 18, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Nombre: ${report.data.teacher.name}`, 18, 50);
  doc.text(`Coordinación: ${report.data.teacher.coordinations?.[0]?.name || 'Coordinación Académica'}`, 108, 50);
  doc.text(`Correo: ${report.data.teacher.email || '—'}`, 18, 55);

  autoTable(doc, {
    startY: 63,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    head: [['Horario / Materia', ...days.map((day, index) => `${day.label}\n${formatDay(addDays(report.data.week.start, index))}`), 'Cumpl.\nSemana']],
    body: report.data.rows.map((row) => [
      `${row.startTime && row.endTime ? `${row.startTime} – ${row.endTime}` : row.rawSchedule}\n${row.subject}\nGrupo ${row.groupCode}${row.classroom ? ` · ${row.classroom}` : ''}`,
      ...days.map((day) => row.cells[day.key]?.status ?? 'NOT_SCHEDULED'),
      formatRate(row.completionRate),
    ]),
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 2.2, valign: 'middle', lineColor: [203, 213, 225], lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold', halign: 'center', minCellHeight: 12 },
    bodyStyles: { textColor: [31, 41, 55], minCellHeight: 16 },
    columnStyles: {
      0: { cellWidth: 52, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 19, halign: 'center' }, 2: { cellWidth: 19, halign: 'center' }, 3: { cellWidth: 19, halign: 'center' },
      4: { cellWidth: 19, halign: 'center' }, 5: { cellWidth: 19, halign: 'center' }, 6: { cellWidth: 19, halign: 'center' },
      7: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0 && data.column.index <= days.length) data.cell.text = [];
    },
    didDrawCell: (data) => drawStatusMark(doc, data, report),
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;
  const summaryY = Math.min(finalY + 8, 269);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, summaryY, 182, 17, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(31, 41, 55);
  doc.text('Resumen de asistencia', 18, summaryY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Programadas: ${report.data.summary.scheduled}`, 18, summaryY + 12);
  doc.text(`Asistencias: ${report.data.summary.taken}`, 60, summaryY + 12);
  doc.text(`Inasistencias: ${report.data.summary.missing}`, 103, summaryY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(200, 16, 46);
  doc.text(`Cumplimiento: ${report.data.summary.completionRate}%`, 151, summaryY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.text('✓ Asistencia    X Inasistencia    — Sin clase    ○ Clase futura', 14, 290);
  doc.text(`Zona horaria: ${report.meta.timezone}`, 196, 290, { align: 'right' });
  doc.save(filename(report));
}

async function exportRangeReportPdf(report: RangeReportResponse): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogo();
  if (logo) doc.addImage(logo, 'PNG', 14, 11, 43, 17);

  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FACULTAD DE INGENIERIA', 62, 17);
  doc.text('TAMPICO', 62, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Reporte de Asistencia Docente por Rango', 62, 28);
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`Periodo: ${formatRange(report.data.range.start, report.data.range.end)}`, 196, 15, { align: 'right' });
  doc.text(`Generado: ${formatDate(report.meta.generatedAt)}`, 196, 20, { align: 'right' });
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(14, 33, 196, 33);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, 38, 182, 20, 'FD');
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Datos del profesor', 18, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Nombre: ${report.data.teacher.name}`, 18, 50);
  doc.text(`Coordinacion: ${report.data.teacher.coordinations?.[0]?.name || 'Coordinacion Academica'}`, 108, 50);
  doc.text(`Correo: ${report.data.teacher.email || '-'}`, 18, 55);

  autoTable(doc, {
    startY: 63,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    head: [['Materia', 'Grado', 'Grupo', 'Dias de clase\nen el periodo', 'Dias de clase\nreportados', 'Porcentaje\nde asistencia']],
    body: report.data.rows.map((row) => [
      `${row.subject}\n${row.rawSchedule || 'Sin horario'}${row.classroom ? ` · ${row.classroom}` : ''}`,
      row.grade || '-',
      row.groupCode || '-',
      row.scheduledClassDays,
      row.reportedClassDays,
      formatRangeRate(row.attendanceRate),
    ]),
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.2, valign: 'middle', lineColor: [203, 213, 225], lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [31, 41, 55], fontStyle: 'bold', halign: 'center', minCellHeight: 13 },
    bodyStyles: { textColor: [31, 41, 55], minCellHeight: 12 },
    columnStyles: {
      0: { cellWidth: 78, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 28, halign: 'center' },
      5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const row = report.data.rows[data.row.index];
        if (row?.attendanceRate === 0) {
          data.cell.styles.fillColor = [255, 255, 0];
          data.cell.styles.textColor = [0, 0, 0];
        }
      }
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;
  const summaryY = Math.min(finalY + 8, 269);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, summaryY, 182, 17, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(31, 41, 55);
  doc.text('Resumen de asistencia', 18, summaryY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Dias programados: ${report.data.summary.scheduledClassDays}`, 18, summaryY + 12);
  doc.text(`Dias reportados: ${report.data.summary.reportedClassDays}`, 64, summaryY + 12);
  doc.text(`Pendientes: ${report.data.summary.missingClassDays}`, 111, summaryY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(200, 16, 46);
  doc.text(`Asistencia: ${formatRangeRate(report.data.summary.attendanceRate)}`, 151, summaryY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.text('Porcentaje = dias de clase reportados / dias de clase en el periodo.', 14, 290);
  doc.text(`Zona horaria: ${report.meta.timezone}`, 196, 290, { align: 'right' });
  doc.save(rangeFilename(report));
}

function drawStatusMark(doc: jsPDF, data: CellHookData, report: WeeklyReportResponse): void {
  if (data.section !== 'body' || data.column.index === 0) return;
  const day = days[data.column.index - 1];
  const row = report.data.rows[data.row.index];
  if (!day || !row) return;
  const status = row.cells[day.key]?.status ?? 'NOT_SCHEDULED';
  const x = data.cell.x + data.cell.width / 2;
  const y = data.cell.y + data.cell.height / 2;
  doc.setLineWidth(0.55);

  if (status === 'TAKEN') {
    doc.setDrawColor(34, 197, 94); doc.circle(x, y, 2.2); doc.line(x - 1.1, y, x - 0.25, y + 0.9); doc.line(x - 0.25, y + 0.9, x + 1.25, y - 1);
  } else if (status === 'MISSING') {
    doc.setDrawColor(248, 113, 113); doc.circle(x, y, 2.2); doc.line(x - 1, y - 1, x + 1, y + 1); doc.line(x + 1, y - 1, x - 1, y + 1);
  } else if (status === 'NOT_SCHEDULED') {
    doc.setDrawColor(203, 213, 225); doc.line(x - 1.5, y, x + 1.5, y);
  } else if (status === 'FUTURE') {
    doc.setDrawColor(148, 163, 184); doc.circle(x, y, 2.2);
  } else {
    drawQuestion(doc, x, y, status);
  }
}

function drawQuestion(doc: jsPDF, x: number, y: number, _status: ReportCellStatus): void {
  doc.setDrawColor(217, 119, 6); doc.circle(x, y, 2.2); doc.setTextColor(217, 119, 6); doc.setFontSize(6); doc.text('?', x, y + 0.8, { align: 'center' });
}

async function loadLogo(): Promise<Uint8Array | null> {
  try { return new Uint8Array(await (await fetch(fiuatLogo)).arrayBuffer()); } catch { return null; }
}
function addDays(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function formatDay(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }
function formatDate(value: string) { return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatRange(start: string, end: string) { return `${formatDay(start)} – ${formatDay(end)}`; }
function formatRate(value: number | null | undefined) { return value == null ? 'N/D' : `${value}%`; }
function formatRangeRate(value: number | null | undefined) { return value == null ? 'N/D' : `${value.toFixed(2)}%`; }
function isRangeReport(report: AttendanceReportResponse): report is RangeReportResponse { return 'range' in report.data; }
function filename(report: WeeklyReportResponse) { return `asistencia-${report.data.teacher.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-semana-${report.data.week.isoWeek}.pdf`; }
function rangeFilename(report: RangeReportResponse) { return `asistencia-${report.data.teacher.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${report.data.range.start}-a-${report.data.range.end}.pdf`; }
