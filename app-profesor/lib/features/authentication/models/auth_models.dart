import 'package:equatable/equatable.dart';

enum AuthStatus { initial, loading, authenticated, unauthenticated, error }

class User extends Equatable {
  final String id;
  final String email;
  final String name;
  final String role;
  final String? employeeId; // ID de empleado UAT
  final String? department; // Departamento/Facultad

  const User({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.employeeId,
    this.department,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
      employeeId: json['employeeId'] as String?,
      department: json['department'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'name': name,
      'role': role,
      'employeeId': employeeId,
      'department': department,
    };
  }

  @override
  List<Object?> get props => [id, email, name, role, employeeId, department];

  User copyWith({
    String? id,
    String? email,
    String? name,
    String? role,
    String? employeeId,
    String? department,
  }) {
    return User(
      id: id ?? this.id,
      email: email ?? this.email,
      name: name ?? this.name,
      role: role ?? this.role,
      employeeId: employeeId ?? this.employeeId,
      department: department ?? this.department,
    );
  }
}

class Group extends Equatable {
  final String id;
  final String name;
  final String subject;
  final String schedule; // "Lunes 08:00-10:00"
  final String classroom;
  final String classroomUuid; // UUID del beacon del salón
  final List<Student> students;
  final String professorId;

  const Group({
    required this.id,
    required this.name,
    required this.subject,
    required this.schedule,
    required this.classroom,
    required this.classroomUuid,
    required this.students,
    required this.professorId,
  });

  factory Group.fromJson(Map<String, dynamic> json) {
    return Group(
      id: json['id'] as String,
      name: json['name'] as String,
      subject: json['subject'] as String,
      schedule: json['schedule'] as String,
      classroom: json['classroom'] as String,
      classroomUuid: json['classroomUuid'] as String,
      students: (json['students'] as List<dynamic>)
          .map(
            (studentJson) =>
                Student.fromJson(studentJson as Map<String, dynamic>),
          )
          .toList(),
      professorId: json['professorId'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'subject': subject,
      'schedule': schedule,
      'classroom': classroom,
      'classroomUuid': classroomUuid,
      'students': students.map((student) => student.toJson()).toList(),
      'professorId': professorId,
    };
  }

  @override
  List<Object?> get props => [
    id,
    name,
    subject,
    schedule,
    classroom,
    classroomUuid,
    students,
    professorId,
  ];
}

class Student extends Equatable {
  final String id;
  final String studentId; // Matrícula UAT
  final String name;
  final String email;
  final List<AttendanceRecord> attendanceRecords;

  const Student({
    required this.id,
    required this.studentId,
    required this.name,
    required this.email,
    this.attendanceRecords = const [],
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'] as String,
      studentId: json['studentId'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      attendanceRecords: (json['attendanceRecords'] as List<dynamic>? ?? [])
          .map(
            (recordJson) =>
                AttendanceRecord.fromJson(recordJson as Map<String, dynamic>),
          )
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'studentId': studentId,
      'name': name,
      'email': email,
      'attendanceRecords': attendanceRecords
          .map((record) => record.toJson())
          .toList(),
    };
  }

  @override
  List<Object?> get props => [id, studentId, name, email, attendanceRecords];
}

class AttendanceRecord extends Equatable {
  final String id;
  final String studentId;
  final String groupId;
  final DateTime date;
  final bool isPresent;
  final String? notes;
  final DateTime createdAt;

  const AttendanceRecord({
    required this.id,
    required this.studentId,
    required this.groupId,
    required this.date,
    required this.isPresent,
    this.notes,
    required this.createdAt,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['id'] as String,
      studentId: json['studentId'] as String,
      groupId: json['groupId'] as String,
      date: DateTime.parse(json['date'] as String),
      isPresent: json['isPresent'] as bool,
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'studentId': studentId,
      'groupId': groupId,
      'date': date.toIso8601String(),
      'isPresent': isPresent,
      'notes': notes,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [
    id,
    studentId,
    groupId,
    date,
    isPresent,
    notes,
    createdAt,
  ];
}

class AuthResult extends Equatable {
  final bool isSuccess;
  final String? message;
  final User? user;
  final String? token;
  final List<Group>? groups; // Grupos del profesor con alumnos

  const AuthResult({
    required this.isSuccess,
    this.message,
    this.user,
    this.token,
    this.groups,
  });

  factory AuthResult.success({
    required User user,
    required String token,
    List<Group>? groups,
  }) {
    return AuthResult(
      isSuccess: true,
      user: user,
      token: token,
      groups: groups,
      message: 'Login exitoso',
    );
  }

  factory AuthResult.failure(String message) {
    return AuthResult(isSuccess: false, message: message);
  }

  @override
  List<Object?> get props => [isSuccess, message, user, token, groups];
}

class AuthState extends Equatable {
  final AuthStatus status;
  final User? user;
  final String? token;
  final List<Group>? groups;
  final String? errorMessage;

  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.token,
    this.groups,
    this.errorMessage,
  });

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? token,
    List<Group>? groups,
    String? errorMessage,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      token: token ?? this.token,
      groups: groups ?? this.groups,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isLoading => status == AuthStatus.loading;
  bool get hasError => status == AuthStatus.error;

  @override
  List<Object?> get props => [status, user, token, groups, errorMessage];
}
