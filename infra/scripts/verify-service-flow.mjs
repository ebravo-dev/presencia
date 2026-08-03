const internalToken = process.env.INTERNAL_API_TOKEN;
if (!internalToken) throw new Error('INTERNAL_API_TOKEN is required.');

const identityUrl = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3200';
const academicUrl = process.env.ACADEMIC_SERVICE_URL ?? 'http://academic-service:3300';
const attendanceUrl = process.env.ATTENDANCE_SERVICE_URL ?? 'http://attendance-service:3400';
const queryUrl = process.env.COORDINATION_QUERY_SERVICE_URL ?? 'http://coordination-query-service:3500';
const gatewayUrl = process.env.API_GATEWAY_URL ?? 'http://api-gateway:8080';
const headers = { 'x-internal-service-token': internalToken, 'x-correlation-id': 'ci-service-flow' };

const identity = await request(identityUrl, '/internal/v1/authenticated-sessions', {
  method: 'POST', expected: 201, body: {
    kind: 'PROFESSOR', role: 'PROFESSOR', institutionalIdentifier: 'teacher-ci',
    email: 'teacher-ci@uat.edu.mx', displayName: 'Profesor CI', source: 'UAT_TEACHER', correlationId: 'ci-service-flow',
  },
});
const accessToken = identity.data?.accessToken;
if (typeof accessToken !== 'string' || accessToken.split('.').length !== 3) throw new Error('Identity did not issue a JWT.');
await request(identityUrl, '/internal/v1/sessions/verify', { method: 'POST', expected: 200, body: { token: accessToken } });
pass('Identity creates and verifies a UAT-authorized professor session');

await request(academicUrl, '/internal/v1/academic/snapshots/professors', {
  method: 'POST', expected: 202, body: {
    snapshotId: '11111111-1111-4111-8111-111111111111', correlationId: 'ci-service-flow', causationId: 'ci-service-flow',
    teacher: {
      externalId: 'teacher-ci', institutionalCode: 'CI-42', name: 'Profesor CI',
      email: 'teacher-ci@uat.edu.mx', authenticatedAt: '2026-08-03T12:00:00.000Z',
    },
    cycle: { externalId: '2026-2', name: '2026-2' },
    groups: [{
      externalGroupId: '947699', code: '1-A', groupLetter: 'A', name: 'Arquitectura de Software',
      level: 'Licenciatura', classroom: 'AULA CI 101', period: '2026-2', schedule: { monday: '07:00-09:00' },
      subject: { externalId: 'subject-ci', code: 'SW-101', name: 'Arquitectura de Software' },
      coordination: { externalId: 'coord-ci', name: 'Coordinación CI', shortName: 'CI' },
      rosterAuthoritative: true,
      students: [{ matricula: '2251330007', name: 'Ana Alumna', uatStudentId: 515722, listNumber: 1 }],
    }],
  },
});
await request(academicUrl, '/internal/v1/academic/snapshots/students', {
  method: 'POST', expected: 202, body: {
    snapshotId: '22222222-2222-4222-8222-222222222222', correlationId: 'ci-service-flow', causationId: 'ci-service-flow',
    synchronizedAt: '2026-08-03T12:00:00.000Z',
    student: { matricula: '2251330007', displayName: 'Ana Alumna', email: '2251330007@alumnos.uat.edu.mx' },
    career: { planExternalId: '3314', name: 'Ingeniería de Software', coordinationExternalId: 'coord-ci' },
    cycle: { externalId: '2026-2', name: '2026-2' },
    schedule: [{
      externalGroupId: '947699', groupLetter: 'A', subjectName: 'Arquitectura de Software',
      professorName: 'Profesor CI', classroom: 'AULA CI 101', period: '2026-2', credits: 5,
      schedule: { monday: '07:00-09:00' },
    }],
  },
});
const student = await request(academicUrl, '/internal/v1/academic/students/2251330007', { method: 'GET', expected: 200 });
if (student.data?.scheduleEntries?.length !== 1) throw new Error('Academic did not persist the student schedule.');
pass('Academic persists professor roster and student schedule snapshots');

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
  { method: 'POST', expected: 200, body: { professorExternalId: 'teacher-ci', classrooms: ['AULA CI 101', 'FORBIDDEN 404'] } },
), (result) => result.data?.length === 1, 'Attendance never authorized the classroom beacon from the professor roster.');
if (professorBeacons.data[0]?.uuid !== '55555555-5555-4555-8555-555555555555'
  || professorBeacons.missing?.includes('FORBIDDEN 404')) {
  throw new Error('Attendance beacon resolution did not enforce professor roster scope.');
}
pass('Attendance imports classroom beacons idempotently and scopes resolution to the professor roster');

const binding = await request(attendanceUrl, '/internal/v1/attendance/device-bindings/initial', {
  method: 'POST', expected: 201, body: {
    matricula: '2251330007', attendanceUuid: '33333333-3333-4333-8333-333333333333',
    deviceBindingId: '33333333-3333-4333-8333-333333333334', platform: 'android', deviceInfo: 'CI device',
  },
});
if (typeof binding.data?.bindingToken !== 'string') throw new Error('Attendance did not return a device binding token.');
const reconciledBinding = await request(gatewayUrl, '/api/student-device-bindings', {
  method: 'POST', expected: 200,
  requestHeaders: { authorization: `Bearer ${binding.data.bindingToken}` },
  body: {
    matricula: '2251330007', attendanceUuid: '33333333-3333-4333-8333-333333333333',
    deviceBindingId: '33333333-3333-4333-8333-333333333334', platform: 'android', deviceInfo: 'CI device',
  },
});
if (reconciledBinding.data?.matricula !== '2251330007') {
  throw new Error('Gateway did not reconcile the scoped binding through Attendance Service.');
}

const professorBindings = await eventually(async () => request(
  attendanceUrl,
  '/internal/v1/attendance/device-bindings/resolve',
  { method: 'POST', expected: 200, body: { professorExternalId: 'teacher-ci', matriculas: ['2251330007'] } },
), (result) => result.data?.length === 1, 'Attendance never authorized the binding from the professor roster.');
if (professorBindings.data[0]?.attendanceUuid !== '33333333-3333-4333-8333-333333333333') {
  throw new Error('Attendance returned an unexpected student binding.');
}
pass('Gateway reconciles the scoped student token and Attendance authorizes professor binding reads');

const captureBody = {
  externalGroupId: '947699', professorExternalId: 'teacher-ci', date: '2026-08-03',
  professorEntryAt: '2026-08-03T13:00:00.000Z', professorExitAt: '2026-08-03T15:00:00.000Z',
  entries: [{ matricula: '2251330007', status: 'PRESENT' }],
};
const capture = await eventually(async () => request(attendanceUrl, '/internal/v1/attendance/captures', {
  method: 'POST', expected: [202, 404],
  requestHeaders: { 'idempotency-key': '44444444-4444-4444-8444-444444444444' }, body: captureBody,
}), (result) => result.status === 202, 'Attendance never consumed the academic roster event.');
const duplicate = await request(attendanceUrl, '/internal/v1/attendance/captures', {
  method: 'POST', expected: 200,
  requestHeaders: { 'idempotency-key': '44444444-4444-4444-8444-444444444444' }, body: captureBody,
});
if (duplicate.data?.duplicate !== true) throw new Error('Attendance idempotency contract was not preserved.');
pass('Attendance binds the device and captures attendance idempotently after consuming the roster event');

const bindings = await request(attendanceUrl, '/internal/v1/attendance/device-bindings?q=2251330007', { method: 'GET', expected: 200 });
if (bindings.data?.length !== 1 || bindings.data[0]?.students?.length !== 1) {
  throw new Error('The authoritative binding is not associated with the synchronized roster.');
}

const teachers = await eventually(async () => request(queryUrl, '/internal/v1/coordination/teachers?search=Profesor%20CI&page=1&pageSize=10', {
  method: 'GET', expected: 200,
}), (result) => result.data?.length === 1, 'Coordination Query never consumed the academic event.');
const teacherId = teachers.data[0]?.id;
if (typeof teacherId !== 'string') throw new Error('Coordination Query did not expose the projected teacher.');
const report = await eventually(async () => request(
  queryUrl,
  `/internal/v1/coordination/reports/attendance-weekly?teacherId=${encodeURIComponent(teacherId)}&weekStart=2026-08-03`,
  { method: 'GET', expected: 200 },
), (result) => result.data?.summary?.taken === 2, 'Coordination Query never projected the attendance event.');
if (report.data.rows?.[0]?.cells?.monday?.portalSyncStatus !== 'PENDING') {
  throw new Error('The dashboard did not preserve the pending UAT upload state.');
}
pass('RabbitMQ projects professor attendance and pending UAT state into the coordination report');

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
  return { status: response.status, ...payload };
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
