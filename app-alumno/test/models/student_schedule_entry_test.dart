import 'package:app_alumno/models/student_schedule_entry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('StudentScheduleEntry', () {
    test('maps the UAT schedule fields and normalizes time ranges', () {
      final schedule = parseStudentSchedule([
        {
          'Id_Grupo': 947699,
          'Txt_Materia': 'Arquitectura de Software',
          'Txt_Espacio_Fisico': 'AULA 101',
          'Txt_Nombre_Profesor': 'Profesor UAT',
          'Txt_Letra': 'A',
          'Num_Periodo': 1,
          'Txt_Lunes': '7:00 - 9:00; 11:00 a 12:00',
          'Txt_Martes': '09:00—10:00',
          'Txt_Miercoles': 'Sin horario',
        },
      ]);

      expect(schedule, hasLength(1));
      final entry = schedule.single;
      expect(entry.externalGroupId, '947699');
      expect(entry.subject, 'Arquitectura de Software');
      expect(entry.classroom, 'AULA 101');
      expect(entry.professor, 'Profesor UAT');
      expect(entry.group, 'A');
      expect(entry.period, '1');
      expect(entry.slots, hasLength(3));
      expect(entry.slots.first.weekday, DateTime.monday);
      expect(entry.slots.first.startTime, '07:00');
      expect(entry.slots.first.endTime, '09:00');
      expect(entry.slots.first.displayTime, '07:00 - 09:00');
    });

    test('returns each day in chronological order', () {
      final schedule = parseStudentSchedule([
        {
          'Id_Grupo': 'later',
          'Txt_Materia': 'Materia B',
          'Txt_Lunes': '10:00 - 11:00',
        },
        {
          'Id_Grupo': 'earlier',
          'Txt_Materia': 'Materia A',
          'Txt_Lunes': '08:00 - 09:00',
        },
      ]);

      final monday = scheduleForWeekday(schedule, DateTime.monday);
      expect(monday.map((occurrence) => occurrence.entry.externalGroupId), [
        'earlier',
        'later',
      ]);
      expect(scheduleForWeekday(schedule, DateTime.sunday), isEmpty);
    });

    test('merges consecutive hours from repeated UAT rows', () {
      final schedule = parseStudentSchedule([
        {
          'Id_Grupo': 'same-group',
          'Txt_Materia': 'Programación móvil',
          'Txt_Espacio_Fisico': 'LAB 2',
          'Txt_Lunes': '08:00 - 09:00',
        },
        {
          'Id_Grupo': 'same-group',
          'Txt_Materia': 'Programación móvil',
          'Txt_Espacio_Fisico': 'LAB 2',
          'Txt_Lunes': '09:00 - 10:00; 10:00 - 11:00',
        },
      ]);

      expect(schedule, hasLength(1));
      final monday = scheduleForWeekday(schedule, DateTime.monday);
      expect(monday, hasLength(1));
      expect(monday.single.slot.displayTime, '08:00 - 11:00');
    });

    test('knows when all classes for today have ended', () {
      final occurrence = scheduleForWeekday(
        parseStudentSchedule([
          {
            'Id_Grupo': 'group-1',
            'Txt_Materia': 'Redes',
            'Txt_Martes': '08:00 - 10:00',
          },
        ]),
        DateTime.tuesday,
      ).single;

      expect(scheduleHasEnded(occurrence, DateTime(2026, 8, 4, 10)), isTrue);
      expect(
        scheduleIsAvailable(occurrence, DateTime(2026, 8, 4, 9, 59)),
        isTrue,
      );
    });

    test('locks a finished class only after coordinator tolerance', () {
      final occurrence = scheduleForWeekday(
        parseStudentSchedule([
          {
            'Id_Grupo': 'group-1',
            'Txt_Materia': 'Redes',
            'Txt_Martes': '12:00 - 13:00',
          },
        ]),
        DateTime.tuesday,
      ).single;

      expect(
        scheduleIsAvailable(
          occurrence,
          DateTime(2026, 8, 4, 13, 9),
          toleranceMinutes: 10,
        ),
        isTrue,
      );
      expect(
        scheduleHasEnded(
          occurrence,
          DateTime(2026, 8, 4, 13, 10),
          toleranceMinutes: 10,
        ),
        isTrue,
      );
      expect(
        scheduleIsAvailable(
          occurrence,
          DateTime(2026, 8, 4, 13, 10),
          toleranceMinutes: 15,
        ),
        isTrue,
      );
    });

    test('ignores explicit empty UAT markers without inventing classes', () {
      final entry = StudentScheduleEntry.fromUatJson({
        'Id_Grupo': 1,
        'Txt_Materia': 'Materia sin horario',
        'Txt_Lunes': '--',
        'Txt_Martes': 'N/A',
        'Txt_Miercoles': 'No aplica',
      });

      expect(entry.slots, isEmpty);
    });

    test('ignores malformed rows without a group or subject', () {
      expect(
        parseStudentSchedule([
          const {'unexpected': true},
        ]),
        isEmpty,
      );
    });
  });
}
