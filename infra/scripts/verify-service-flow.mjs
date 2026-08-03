const internalToken = process.env.INTERNAL_API_TOKEN;
if (!internalToken) throw new Error('INTERNAL_API_TOKEN is required.');

const identityUrl = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3200';
const academicUrl = process.env.ACADEMIC_SERVICE_URL ?? 'http://academic-service:3300';
const attendanceUrl = process.env.ATTENDANCE_SERVICE_URL ?? 'http://attendance-service:3400';
const queryUrl = process.env.COORDINATION_QUERY_SERVICE_URL ?? 'http://coordination-query-service:3500';
const gatewayUrl = process.env.API_GATEWAY_URL ?? 'http://api-gateway:8080';
const uatPortalMockUrl = process.env.UAT_PORTAL_MOCK_URL ?? 'http://uat-portal-mock:3900';
const headers = { 'x-internal-service-token': internalToken, 'x-correlation-id': 'ci-service-flow' };
const now = new Date();
const verificationObservedAt = now.toISOString();
const attendanceDate = dateInTimeZone(now, 'America/Monterrey');
const attendanceWeek = isoWeekFor(attendanceDate);
const schoolCycle = schoolCycleFor(attendanceWeek.weekStart);
const teacherUsername = 'teacher-ci@uat.edu.mx';
const teacherPassword = 'teacher-ci-password';
const studentUsername = 'student-ci@alumnos.uat.edu.mx';
const studentPassword = 'student-ci-password';
const professorExternalId = '42';
const matricula = '2251330007';

const teacherSession = await request(gatewayUrl, '/api/uat/sessions', {
  method: 'POST', expected: 201, body: { username: teacherUsername, password: teacherPassword },
});
const teacherSessionId = teacherSession.sessionId;
const accessToken = teacherSession.identitySession?.accessToken;
if (typeof teacherSessionId !== 'string') throw new Error('UAT Integration did not return a professor session.');
if (typeof accessToken !== 'string' || accessToken.split('.').length !== 3) throw new Error('Identity did not issue a JWT.');
await request(identityUrl, '/internal/v1/sessions/verify', { method: 'POST', expected: 200, body: { token: accessToken } });
pass('Gateway authenticates the professor against UAT and Identity verifies the resulting session');

const superUserPassword = process.env.SUPER_USER_PASSWORD;
if (!superUserPassword) throw new Error('SUPER_USER_PASSWORD is required.');
const superLogin = await request(gatewayUrl, '/api/superUsuario/auth/login', {
  method: 'POST', expected: 200, body: { password: superUserPassword },
});
const superCookie = cookieFrom(superLogin.responseHeaders, 'super_user_session');
await request(gatewayUrl, '/api/superUsuario/coordinadores', {
  method: 'POST', expected: 201, requestHeaders: { cookie: superCookie },
  body: {
    email: 'coord-ci@uat.edu.mx', name: 'Coordinación CI', password: 'coordinator-ci-password', role: 'COORDINATOR',
  },
});
const staffAccounts = await request(gatewayUrl, '/api/superUsuario/coordinadores', {
  method: 'GET', expected: 200, requestHeaders: { cookie: superCookie },
});
if (staffAccounts.data?.length !== 1 || staffAccounts.data[0]?.email !== 'coord-ci@uat.edu.mx') {
  throw new Error('Super-user BFF did not delegate staff administration to Identity.');
}
const coordinatorLogin = await request(gatewayUrl, '/api/coordinacion/auth/login', {
  method: 'POST', expected: 200, body: { email: 'coord-ci@uat.edu.mx', password: 'coordinator-ci-password' },
});
const coordinatorCookie = cookieFrom(coordinatorLogin.responseHeaders, 'coord_session');
const coordinatorMe = await request(gatewayUrl, '/api/coordinacion/auth/me', {
  method: 'GET', expected: 200, requestHeaders: { cookie: coordinatorCookie },
});
if (coordinatorMe.data?.user?.role !== 'COORDINATOR') throw new Error('Coordinator session is not backed by Identity.');
pass('Identity owns coordinator and super-user sessions behind the stable BFF contracts');

const harvestedGroups = await eventually(async () => request(
  academicUrl,
  `/internal/v1/academic/professors/${encodeURIComponent(professorExternalId)}/groups`,
  { method: 'GET', expected: 200 },
), (result) => result.data?.some((group) => group.externalGroupId === '947699'), 'Academic never received the UAT professor harvest.');
const harvestedGroup = harvestedGroups.data.find((group) => group.externalGroupId === '947699');
if (harvestedGroup?.classroom !== 'AULA CI 101'
  || !harvestedGroup.enrollments?.some((student) => student.matricula === matricula)) {
  throw new Error('The UAT professor harvest did not preserve its classroom and authoritative roster.');
}
pass('UAT Integration harvests professor groups and roster into Academic through RabbitMQ');

await request(academicUrl, '/internal/v1/academic/snapshots/professors', {
  method: 'POST', expected: 202, body: {
    snapshotId: '11111111-1111-4111-8111-111111111111', correlationId: 'ci-service-flow', causationId: 'ci-service-flow',
    teacher: {
      externalId: professorExternalId, institutionalCode: 'CI-42', name: 'Profesor CI',
      email: teacherUsername, authenticatedAt: verificationObservedAt,
    },
    cycle: { externalId: schoolCycle.name, name: schoolCycle.name },
    groups: [{
      externalGroupId: '947699', code: '1-A', groupLetter: 'A', name: 'Arquitectura de Software',
      level: 'Licenciatura', classroom: 'AULA CI 101', period: schoolCycle.name, schedule: { monday: '07:00-09:00' },
      subject: { externalId: '12:SW-101', code: 'SW-101', name: 'Arquitectura de Software' },
      coordination: { externalId: '12', name: 'Coordinacion CI', shortName: 'CI' },
      rosterAuthoritative: true,
      students: [{ matricula, name: 'Ana Alumna', uatStudentId: 515722, listNumber: 1 }],
    }, {
      externalGroupId: '947700', code: '1-B', groupLetter: 'B', name: 'Pruebas de Software',
      level: 'Licenciatura', classroom: 'AULA CI 102', period: schoolCycle.name, schedule: { tuesday: '07:00-09:00' },
      subject: { externalId: 'subject-ci-2', code: 'SW-102', name: 'Pruebas de Software' },
      coordination: { externalId: '12', name: 'Coordinacion CI', shortName: 'CI' },
      rosterAuthoritative: true,
      students: [{ matricula, name: 'Ana Alumna', uatStudentId: 515722, listNumber: 1 }],
    }],
  },
});
await request(academicUrl, '/internal/v1/academic/snapshots/professors', {
  method: 'POST', expected: 202, body: {
    snapshotId: '33333333-1111-4111-8111-111111111111', correlationId: 'ci-service-flow', causationId: 'ci-service-flow',
    teacher: {
      externalId: 'teacher-delegate-ci', institutionalCode: 'CI-43', name: 'Profesor Compartido CI',
      email: 'teacher-delegate-ci@uat.edu.mx', authenticatedAt: verificationObservedAt,
    },
    cycle: { externalId: schoolCycle.name, name: schoolCycle.name },
    groups: [],
  },
});
const attendanceUuid = '33333333-3333-4333-8333-333333333333';
const deviceBindingId = '33333333-3333-4333-8333-333333333334';
const studentSession = await request(gatewayUrl, '/api/uat/alumnos/sessions', {
  method: 'POST', expected: 201, body: {
    username: studentUsername,
    password: studentPassword,
    attendanceUuid,
    deviceBindingId,
    platform: 'android',
    deviceInfo: 'CI device',
  },
});
if (typeof studentSession.sessionId !== 'string' || typeof studentSession.deviceBindingToken !== 'string') {
  throw new Error('Student UAT login did not return its session and device binding token.');
}
await request(identityUrl, '/internal/v1/sessions/verify', {
  method: 'POST', expected: 200, body: { token: studentSession.identitySession?.accessToken },
});
const studentSchedule = await request(gatewayUrl, '/api/uat/alumnos/horario', {
  method: 'GET', expected: 200,
  requestHeaders: { 'x-uat-student-session-id': studentSession.sessionId },
});
if (studentSchedule.data?.length !== 1 || String(studentSchedule.data[0]?.Id_Grupo) !== '947699') {
  throw new Error('Student API did not return the schedule obtained from UAT.');
}
const student = await eventually(async () => request(
  academicUrl,
  `/internal/v1/academic/students/${encodeURIComponent(matricula)}`,
  { method: 'GET', expected: [200, 404] },
), (result) => result.status === 200 && result.data?.scheduleEntries?.length === 1, 'Academic never persisted the student UAT schedule.');
pass('Student UAT login binds the phone and the REST API persists the returned schedule in Academic');

const beaconImportBody = {
  beacons: [{ uuid: '55555555-5555-4555-8555-555555555555', classroom: 'AULA CI 101' }],
  actorIdentityId: 'migration:ci', actorRole: 'SYSTEM', reason: 'Importación idempotente de verificación CI.',
};
const beaconImport = await request(attendanceUrl, '/internal/v1/attendance/classroom-beacons/import', {
  method: 'POST', expected: 200, body: beaconImportBody,
});
if (beaconImport.data?.imported + beaconImport.data?.unchanged !== 1) {
  throw new Error('Attendance did not accept the classroom beacon import.');
}
const professorBeacons = await eventually(async () => request(
  attendanceUrl,
  '/internal/v1/attendance/classroom-beacons/resolve',
  { method: 'POST', expected: 200, body: { professorExternalId, classrooms: ['AULA CI 101', 'FORBIDDEN 404'] } },
), (result) => result.data?.length === 1, 'Attendance never authorized the classroom beacon from the professor roster.');
if (professorBeacons.data[0]?.uuid !== '55555555-5555-4555-8555-555555555555'
  || professorBeacons.missing?.includes('FORBIDDEN 404')) {
  throw new Error('Attendance beacon resolution did not enforce professor roster scope.');
}
pass('Attendance imports classroom beacons idempotently and scopes resolution to the professor roster');

const reconciledBinding = await request(gatewayUrl, '/api/student-device-bindings', {
  method: 'POST', expected: 200,
  requestHeaders: { authorization: `Bearer ${studentSession.deviceBindingToken}` },
  body: {
    matricula, attendanceUuid, deviceBindingId, platform: 'android', deviceInfo: 'CI device',
  },
});
if (reconciledBinding.data?.matricula !== matricula) {
  throw new Error('Gateway did not reconcile the scoped binding through Attendance Service.');
}

const professorBindings = await eventually(async () => request(
  attendanceUrl,
  '/internal/v1/attendance/device-bindings/resolve',
  { method: 'POST', expected: 200, body: { professorExternalId, matriculas: [matricula] } },
), (result) => result.data?.length === 1, 'Attendance never authorized the binding from the professor roster.');
if (professorBindings.data[0]?.attendanceUuid !== attendanceUuid) {
  throw new Error('Attendance returned an unexpected student binding.');
}
pass('Gateway reconciles the scoped student token and Attendance authorizes professor binding reads');

const professorSessionHeader = { 'x-uat-session-id': teacherSessionId };
const professorEntry = await request(gatewayUrl, '/api/uat/profesor/presencia/entrada', {
  method: 'POST', expected: [200, 201], body: {
    externalGroupId: '947699',
    beaconUuid: '55555555-5555-4555-8555-555555555555', clientDetectedAt: verificationObservedAt,
    rssi: -58, distance: 1.4, bluetoothAddress: 'CI:BE:AC:ON:01',
  }, requestHeaders: professorSessionHeader,
});
if (!professorEntry.data?.attendanceSessionId || !professorEntry.data?.professorEntryAt) {
  throw new Error('Attendance did not create the professor presence draft.');
}
const studentPresence = await request(gatewayUrl, '/api/uat/profesor/presencia/alumnos', {
  method: 'POST', expected: [200, 201], body: {
    externalGroupId: '947699',
    detections: [{
      beaconUuid: attendanceUuid, detectedAt: verificationObservedAt,
      rssi: -62, distance: 1.8, txPower: -59, bluetoothAddress: 'CI:ST:UD:EN:01', major: 1, minor: 7,
    }],
  }, requestHeaders: professorSessionHeader,
});
if (studentPresence.data?.matchedCount !== 1 || studentPresence.data?.matched?.[0]?.matricula !== matricula) {
  throw new Error('Attendance did not match the BLE detection to the roster and active binding.');
}
await request(gatewayUrl, '/api/uat/profesor/presencia/salida', {
  method: 'POST', expected: [200, 201], body: {
    externalGroupId: '947699', clientDetectedAt: verificationObservedAt,
  }, requestHeaders: professorSessionHeader,
});
const draftProjection = await request(attendanceUrl, '/internal/v1/attendance/coordination-projection', {
  method: 'GET', expected: 200,
});
const presenceDraft = draftProjection.data?.find(
  (item) => item.attendanceSessionId === professorEntry.data.attendanceSessionId,
);
if (presenceDraft?.uploadStatus !== 'DRAFT' || presenceDraft.entriesCount !== 1) {
  throw new Error('BLE presence was not projected as a non-uploadable draft.');
}
pass('Attendance persists server-timed BLE telemetry as a DRAFT without requesting a UAT upload');

const captureBody = {
  ClientRecordId: 'ci-professor-attendance-1',
  Id_Grupo: 947699,
  Fec_Ini: attendanceWeek.uatWeekStart,
  Asistencia: [{
    id_alumno: 515722,
    num_pase_lista: 1,
    num_dia: 1,
    sn_asistencia: true,
  }],
};
const capture = await eventually(async () => request(gatewayUrl, '/api/uat/profesor/control-asistencia/asistencias', {
  method: 'POST', expected: [202, 404],
  requestHeaders: professorSessionHeader, body: captureBody,
}), (result) => result.status === 202, 'Attendance never consumed the academic roster event.');
if (capture.data?.uploadStatus !== 'PENDING' || capture.data?.duplicate !== false) {
  throw new Error('The owner capture was not accepted as a new pending UAT publication.');
}
const duplicate = await request(gatewayUrl, '/api/uat/profesor/control-asistencia/asistencias', {
  method: 'POST', expected: 202,
  requestHeaders: professorSessionHeader, body: captureBody,
});
if (duplicate.data?.duplicate !== true) throw new Error('Attendance idempotency contract was not preserved.');
const uploadStatus = await eventually(async () => request(gatewayUrl, '/api/uat/asistencia/registros/estado', {
  method: 'POST', expected: 200,
  requestHeaders: professorSessionHeader,
  body: { clientRecordIds: [captureBody.ClientRecordId] },
}), (result) => result.data?.[0]?.status === 'COMPLETED', 'The durable UAT upload job never completed.');
if (uploadStatus.data[0]?.attempts !== 1) throw new Error('The idempotent UAT job was processed more than once.');
const mockState = await request(uatPortalMockUrl, '/__mock/state', { method: 'GET', expected: 200 });
if (mockState.attendanceWrites?.length !== 1) {
  throw new Error('The UAT portal did not receive exactly one attendance write.');
}
pass('The BFF persists one idempotent UAT job before 202 and the worker completes the portal write');

const bindings = await request(attendanceUrl, `/internal/v1/attendance/device-bindings?q=${encodeURIComponent(matricula)}`, { method: 'GET', expected: 200 });
if (bindings.data?.length !== 1 || !bindings.data[0]?.students?.some(
  (student) => student.group?.externalGroupId === String(captureBody.Id_Grupo),
)) {
  throw new Error('The authoritative binding is not associated with the synchronized roster.');
}

const teachers = await eventually(async () => request(queryUrl, '/internal/v1/coordination/teachers?search=Profesor%20CI&page=1&pageSize=10', {
  method: 'GET', expected: 200,
}), (result) => result.data?.length === 1, 'Coordination Query never consumed the academic event.');
const teacherId = teachers.data[0]?.id;
if (typeof teacherId !== 'string') throw new Error('Coordination Query did not expose the projected teacher.');
const report = await eventually(async () => request(
  queryUrl,
  `/internal/v1/coordination/reports/attendance-weekly?teacherId=${encodeURIComponent(teacherId)}&weekStart=${attendanceWeek.weekStart}`,
  { method: 'GET', expected: 200 },
), (result) => result.data?.rows?.some((row) => row.cells?.monday?.portalSyncStatus === 'COMPLETED'), 'Coordination Query never projected the attendance upload result.');
if (!report.data.rows?.some((row) => row.cells?.monday?.portalSyncStatus === 'COMPLETED')) {
  throw new Error('The dashboard did not project the completed UAT upload state.');
}
pass('RabbitMQ projects professor attendance and completed UAT state into the coordination report');

const sharedOptions = await request(academicUrl, '/internal/v1/academic/shared-classes/options', {
  method: 'GET', expected: 200,
});
const sharedSource = sharedOptions.data?.assignments?.find((item) => item.externalGroupId === '947700');
const sharedTeacher = sharedOptions.data?.teachers?.find((item) => item.externalId === 'teacher-delegate-ci');
if (!sharedSource?.id || !sharedTeacher?.id) throw new Error('Academic did not expose shared-class command references.');
const sharedAssignment = await request(academicUrl, '/internal/v1/academic/shared-classes', {
  method: 'POST', expected: 201, body: {
    sourceAssignmentId: sharedSource.id, assignedTeacherId: sharedTeacher.id,
    schoolCycleYear: schoolCycle.year, schoolCycleTerm: schoolCycle.term, active: true, notes: 'Cobertura CI',
    actorIdentityId: 'coord-ci', actorRole: 'COORDINATOR', reason: 'Asignación compartida para verificación CI.',
  },
});
if (!sharedAssignment.data?.id) throw new Error('Academic did not create the shared-class assignment.');
const sharedForTeacher = await request(academicUrl, '/internal/v1/academic/shared-classes/for-teacher', {
  method: 'POST', expected: 200,
  body: { identity: 'teacher-delegate-ci', year: schoolCycle.year, term: schoolCycle.term },
});
if (sharedForTeacher.data?.[0]?.id !== '947700' || sharedForTeacher.data?.[0]?.source !== 'SHARED') {
  throw new Error('Academic did not expose the Flutter-compatible shared class.');
}
await request(attendanceUrl, '/internal/v1/attendance/classroom-beacons/import', {
  method: 'POST', expected: 200, body: {
    beacons: [{ uuid: '66666666-6666-4666-8666-666666666666', classroom: 'AULA CI 102' }],
    actorIdentityId: 'migration:ci', actorRole: 'SYSTEM', reason: 'Importación de beacon para clase compartida CI.',
  },
});
const delegateBeacons = await eventually(async () => request(
  attendanceUrl,
  '/internal/v1/attendance/classroom-beacons/resolve',
  { method: 'POST', expected: 200, body: { professorExternalId: 'teacher-delegate-ci', classrooms: ['AULA CI 102'] } },
), (result) => result.data?.length === 1, 'Attendance never consumed the shared-class access grant.');
if (delegateBeacons.data[0]?.uuid !== '66666666-6666-4666-8666-666666666666') {
  throw new Error('Attendance resolved an unexpected delegated classroom beacon.');
}
const delegateBindings = await request(attendanceUrl, '/internal/v1/attendance/device-bindings/resolve', {
  method: 'POST', expected: 200,
  body: { professorExternalId: 'teacher-delegate-ci', matriculas: [matricula] },
});
if (delegateBindings.data?.length !== 1) throw new Error('Shared professor could not resolve the assigned roster binding.');
await request(attendanceUrl, '/internal/v1/attendance/presence/professor-entry', {
  method: 'POST', expected: [200, 201], body: {
    professorExternalId: 'teacher-delegate-ci', externalGroupId: '947700', trustedGroupAuthorization: false,
    beaconUuid: '66666666-6666-4666-8666-666666666666', clientDetectedAt: verificationObservedAt,
  },
});
const delegatedCapture = await request(attendanceUrl, '/internal/v1/attendance/captures', {
  method: 'POST', expected: 202,
  requestHeaders: { 'idempotency-key': '77777777-7777-4777-8777-777777777777' },
  body: {
    externalGroupId: '947700', professorExternalId: 'teacher-delegate-ci', date: attendanceDate,
    entries: [{ matricula, status: 'PRESENT' }],
  },
});
if (delegatedCapture.data?.uploadStatus !== 'SKIPPED') {
  throw new Error('Delegated attendance must finalize without requesting a UAT upload.');
}
pass('Academic grants shared-class access and Attendance authorizes BLE while skipping owner-only UAT upload');

await request(academicUrl, `/internal/v1/academic/shared-classes/${encodeURIComponent(sharedAssignment.data.id)}`, {
  method: 'DELETE', expected: 204,
  body: { actorIdentityId: 'coord-ci', actorRole: 'COORDINATOR', reason: 'Revocación de verificación CI.' },
});
await eventually(async () => request(
  attendanceUrl,
  '/internal/v1/attendance/classroom-beacons/resolve',
  { method: 'POST', expected: 200, body: { professorExternalId: 'teacher-delegate-ci', classrooms: ['AULA CI 102'] } },
), (result) => result.data?.length === 0, 'Attendance did not consume the shared-class revocation.');
pass('Shared-class revocation removes delegated Attendance access');

async function request(baseUrl, path, options) {
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: 'application/json', ...headers, ...options.requestHeaders,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload = await response.json().catch(() => undefined);
  const expected = Array.isArray(options.expected) ? options.expected : [options.expected];
  if (!expected.includes(response.status)) {
    throw new Error(`${options.method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, responseHeaders: response.headers, ...payload };
}

function cookieFrom(responseHeaders, name) {
  const setCookie = responseHeaders.get('set-cookie');
  const cookie = setCookie?.split(',').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}.`);
  return cookie.split(';', 1)[0];
}

async function eventually(action, predicate, message) {
  let last;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    last = await action();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${message} Last response: ${JSON.stringify(last)}`);
}

function pass(message) {
  process.stdout.write(`PASS ${message}\n`);
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isoWeekFor(date) {
  const localMidday = new Date(`${date}T12:00:00.000Z`);
  const dayNumber = ((localMidday.getUTCDay() + 6) % 7) + 1;
  const weekStartDate = new Date(localMidday);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - dayNumber + 1);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const [year, month, day] = weekStart.split('-');
  return { weekStart, uatWeekStart: `${day}/${month}/${year}` };
}

function schoolCycleFor(date) {
  const value = new Date(`${date}T12:00:00.000Z`);
  const month = value.getUTCMonth() + 1;
  const term = month <= 5 ? 1 : month <= 7 || (month === 8 && value.getUTCDate() <= 7) ? 2 : 3;
  const year = value.getUTCFullYear();
  return { year, term, name: `${year}-${term}` };
}
