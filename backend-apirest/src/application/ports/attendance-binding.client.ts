export interface StudentDeviceBindingInput {
  matricula: string;
  attendanceUuid: string;
  deviceBindingId?: string;
  platform?: string;
  deviceInfo?: string;
}

export interface StudentDeviceBindingResponse {
  data: { bindingToken: string };
}

export interface AttendanceBindingClient {
  createStudentDeviceBinding(input: StudentDeviceBindingInput): Promise<StudentDeviceBindingResponse>;
}
