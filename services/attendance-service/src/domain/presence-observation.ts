export interface PresenceActor {
  readonly professorExternalId: string;
  readonly externalGroupId: string;
  readonly trustedGroupAuthorization: boolean;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly observedAt: Date;
  readonly attendanceDate: string;
}

export interface ProfessorEntryObservationCommand extends PresenceActor {
  readonly beaconUuid: string;
  readonly clientDetectedAt?: Date | null | undefined;
  readonly rssi?: number | null | undefined;
  readonly distance?: number | null | undefined;
  readonly bluetoothAddress?: string | null | undefined;
}

export type ProfessorExitObservationCommand = PresenceActor & {
  readonly clientDetectedAt?: Date | null | undefined;
};

export interface StudentDetectionValue {
  readonly beaconUuid: string;
  readonly clientDetectedAt?: Date | null | undefined;
  readonly rssi?: number | null | undefined;
  readonly distance?: number | null | undefined;
  readonly txPower?: number | null | undefined;
  readonly bluetoothAddress?: string | null | undefined;
  readonly major?: number | null | undefined;
  readonly minor?: number | null | undefined;
}

export interface StudentPresenceObservationCommand extends PresenceActor {
  readonly detections: readonly StudentDetectionValue[];
}

export interface ProfessorPresenceObservationResult {
  readonly attendanceSessionId: string;
  readonly externalGroupId: string;
  readonly date: string;
  readonly professorEntryAt: string | null;
  readonly professorExitAt: string | null;
  readonly duplicate: boolean;
  readonly version: number;
}

export interface StudentPresenceObservationResult {
  readonly attendanceSessionId: string | null;
  readonly externalGroupId: string;
  readonly date: string;
  readonly matchedCount: number;
  readonly matched: ReadonlyArray<{ studentId: string; matricula: string; beaconUuid: string; detectedAt: string }>;
  readonly duplicate: boolean;
  readonly version: number | null;
}
