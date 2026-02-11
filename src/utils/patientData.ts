import patient1Data from '../../sample_data/patient1.json';
import patient2Data from '../../sample_data/patient2.json';
import {
  AllergyIntolerance,
  Bundle,
  Condition,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
} from '@medplum/fhirtypes';

export interface PatientBundle {
  patient: Patient;
  observations: Observation[];
  conditions: Condition[];
  allergies: AllergyIntolerance[];
  medications: MedicationRequest[];
  immunizations: Immunization[];
}

const patientDataMap = new Map<string, Bundle>([
  ['patient1', patient1Data as Bundle],
  ['patient2', patient2Data as Bundle],
]);

export function getAvailablePatients(): Array<{ id: string; name: string }> {
  return [
    { id: 'patient1', name: 'Lucien408 Bosco882' },
    { id: 'patient2', name: 'Dustin31 Ritchie586' },
  ];
}

export function getPatientData(patientId: string): PatientBundle | null {
  const bundle = patientDataMap.get(patientId);
  if (!bundle || !bundle.entry) {
    return null;
  }

  const patient = bundle.entry.find((e) => e.resource?.resourceType === 'Patient')?.resource as Patient;
  if (!patient) {
    return null;
  }

  const observations = bundle.entry
    .filter((e) => e.resource?.resourceType === 'Observation')
    .map((e) => e.resource as Observation);

  const conditions = bundle.entry
    .filter((e) => e.resource?.resourceType === 'Condition')
    .map((e) => e.resource as Condition);

  const allergies = bundle.entry
    .filter((e) => e.resource?.resourceType === 'AllergyIntolerance')
    .map((e) => e.resource as AllergyIntolerance);

  const medications = bundle.entry
    .filter((e) => e.resource?.resourceType === 'MedicationRequest')
    .map((e) => e.resource as MedicationRequest);

  const immunizations = bundle.entry
    .filter((e) => e.resource?.resourceType === 'Immunization')
    .map((e) => e.resource as Immunization);

  return {
    patient,
    observations,
    conditions,
    allergies,
    medications,
    immunizations,
  };
}

export function getVitalObservations(observations: Observation[]) {
  return {
    bloodPressure: observations.filter((obs) => obs.code?.coding?.[0]?.code === '85354-9'),
    heartRate: observations.filter((obs) => obs.code?.coding?.[0]?.code === '8867-4'),
    weight: observations.filter((obs) => obs.code?.coding?.[0]?.code === '29463-7'),
    height: observations.filter((obs) => obs.code?.coding?.[0]?.code === '8302-2'),
    bmi: observations.filter((obs) => obs.code?.coding?.[0]?.code === '39156-5'),
    temperature: observations.filter((obs) => obs.code?.coding?.[0]?.code === '8310-5'),
    respiratoryRate: observations.filter((obs) => obs.code?.coding?.[0]?.code === '9279-1'),
  };
}
