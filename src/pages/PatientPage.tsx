import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Grid,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { calculateAgeString, formatDate, formatHumanName, MedplumClient } from '@medplum/core';
import { AllergyIntolerance, Condition, HumanName, Immunization, MedicationRequest, Observation, Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum } from '@medplum/react';
import { ChartData } from 'chart.js';
import { JSX, useEffect, useState } from 'react';
import { LineChart } from '../components/LineChart';
import { VoiceNotes } from '../components/VoiceNotes';

interface PatientBundle {
  patient: Patient;
  observations: Observation[];
  conditions: Condition[];
  allergies: AllergyIntolerance[];
  medications: MedicationRequest[];
  immunizations: Immunization[];
}

function getVitalObservations(observations: Observation[]) {
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

export function PatientPage(): JSX.Element {
  const [patientData, setPatientData] = useState<PatientBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get credentials from session storage (set during SMART launch)
        const smartPatientId = sessionStorage.getItem('smart_patient');
        const smartAccessToken = sessionStorage.getItem('smart_access_token');
        const baseUrl = sessionStorage.getItem('smart_base_url');

        if (!smartPatientId) {
          throw new Error('No patient ID found. Please launch the app from your EHR.');
        }

        if (!smartAccessToken || !baseUrl) {
          throw new Error('No authentication credentials found. Please launch the app from your EHR.');
        }

        // Create a medplum client with stored credentials
        const medplum = new MedplumClient({
          baseUrl: baseUrl,
          fhirUrlPath: '',
          accessToken: smartAccessToken,
        });

        // Fetch patient resource
        const patient = await medplum.readResource('Patient', smartPatientId);

        // Fetch all related resources in parallel
        const [observations, conditions, allergies, medications, immunizations] = await Promise.all([
          medplum.searchResources('Observation', { patient: `Patient/${smartPatientId}`, _count: '1000' }),
          medplum.searchResources('Condition', { patient: `Patient/${smartPatientId}`, _count: '1000' }),
          medplum.searchResources('AllergyIntolerance', { patient: `Patient/${smartPatientId}`, _count: '1000' }),
          medplum.searchResources('MedicationRequest', { patient: `Patient/${smartPatientId}`, _count: '1000' }),
          medplum.searchResources('Immunization', { patient: `Patient/${smartPatientId}`, _count: '1000' }),
        ]);

        setPatientData({
          patient,
          observations,
          conditions,
          allergies,
          medications,
          immunizations,
        });
      } catch (err) {
        console.error('Error fetching patient data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load patient data');
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, []);

  const getBpChartData = (): ChartData<'line', number[]> => {
    if (!patientData) {
      return { labels: [], datasets: [] };
    }

    const vitals = getVitalObservations(patientData.observations);
    const bpReadings = vitals.bloodPressure.slice(0, 10).reverse();

    const dates = bpReadings.map((obs) => formatDate(obs.effectiveDateTime as string) || 'Unknown');
    const systolicData = bpReadings.map((obs) => {
      const systolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8480-6');
      return systolic?.valueQuantity?.value ?? 0;
    });
    const diastolicData = bpReadings.map((obs) => {
      const diastolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8462-4');
      return diastolic?.valueQuantity?.value ?? 0;
    });

    return {
      labels: dates,
      datasets: [
        {
          label: 'Systolic',
          data: systolicData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
        },
        {
          label: 'Diastolic',
          data: diastolicData,
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
        },
      ],
    };
  };

  const getLatestVital = (observations: Observation[]): { value: string; date: string } | null => {
    if (!observations.length) return null;
    const latest = observations[0];
    const value = latest.valueQuantity?.value;
    const unit = latest.valueQuantity?.unit;
    const date = formatDate(latest.effectiveDateTime as string);
    return value ? { value: `${value} ${unit || ''}`, date: date || 'Unknown' } : null;
  };

  const getLatestBP = (bpObservations: Observation[]): { value: string; date: string } | null => {
    if (!bpObservations.length) return null;
    const latest = bpObservations[0];
    const systolic = latest.component?.find((c) => c.code?.coding?.[0].code === '8480-6')?.valueQuantity?.value;
    const diastolic = latest.component?.find((c) => c.code?.coding?.[0].code === '8462-4')?.valueQuantity?.value;
    const date = formatDate(latest.effectiveDateTime as string);
    return systolic && diastolic ? { value: `${systolic}/${diastolic} mmHg`, date: date || 'Unknown' } : null;
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text>Loading patient data...</Text>
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Card withBorder p="xl" bg="red.0">
          <Text c="red" fw={600} size="lg" mb="sm">
            Error Loading Patient Data
          </Text>
          <Text c="red">{error}</Text>
        </Card>
      </Container>
    );
  }

  if (!patientData) {
    return (
      <Container>
        <Text ta="center" mt="xl">
          No patient data found
        </Text>
      </Container>
    );
  }

  const { patient, observations, conditions, allergies, medications, immunizations } = patientData;
  const vitals = getVitalObservations(observations);
  const latestBP = getLatestBP(vitals.bloodPressure);
  const latestWeight = getLatestVital(vitals.weight);
  const latestHeartRate = getLatestVital(vitals.heartRate);
  const latestBMI = getLatestVital(vitals.bmi);

  return (
    <Container size="xl" mt="xl" pb="xl">
      <Stack gap="lg">
        {/* Patient Header */}
        <Card withBorder p="md">
          <Title order={2}>Patient Dashboard</Title>
        </Card>

        {/* Patient Demographics */}
        <Card withBorder p="lg">
          <Group align="flex-start" gap="xl">
            <Box>
              <ResourceAvatar value={patient} size={100} radius={100} />
            </Box>
            <Stack gap="xs" style={{ flex: 1 }}>
              <Title order={1}>{formatHumanName(patient.name?.[0] as HumanName)}</Title>
              <Group gap="xl">
                <div>
                  <Text size="sm" c="dimmed">
                    Date of Birth
                  </Text>
                  <Text size="md" fw={500}>
                    {patient.birthDate} ({calculateAgeString(patient.birthDate || '')})
                  </Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">
                    Gender
                  </Text>
                  <Text size="md" fw={500} tt="capitalize">
                    {patient.gender}
                  </Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">
                    Marital Status
                  </Text>
                  <Text size="md" fw={500}>
                    {patient.maritalStatus?.text || 'N/A'}
                  </Text>
                </div>
              </Group>
              <Divider my="sm" />
              <Group gap="xl">
                <div>
                  <Text size="sm" c="dimmed">
                    Address
                  </Text>
                  <Text size="md">
                    {patient.address?.[0]?.line?.[0]}
                    <br />
                    {patient.address?.[0]?.city}, {patient.address?.[0]?.state} {patient.address?.[0]?.postalCode}
                  </Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">
                    Phone
                  </Text>
                  <Text size="md">{patient.telecom?.[0]?.value || 'N/A'}</Text>
                </div>
              </Group>
            </Stack>
          </Group>
        </Card>

        {/* Voice Notes / Clinical Notes */}
        <VoiceNotes patientId={patient.id || ''} />

        {/* Vital Signs Summary */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Latest Vital Signs
          </Title>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm" bg="rgba(255, 99, 132, 0.05)">
                <Text size="sm" c="dimmed">
                  Blood Pressure
                </Text>
                <Text size="xl" fw={700}>
                  {latestBP?.value || 'N/A'}
                </Text>
                <Text size="xs" c="dimmed">
                  {latestBP?.date || ''}
                </Text>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm" bg="rgba(53, 162, 235, 0.05)">
                <Text size="sm" c="dimmed">
                  Heart Rate
                </Text>
                <Text size="xl" fw={700}>
                  {latestHeartRate?.value || 'N/A'}
                </Text>
                <Text size="xs" c="dimmed">
                  {latestHeartRate?.date || ''}
                </Text>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm" bg="rgba(75, 192, 192, 0.05)">
                <Text size="sm" c="dimmed">
                  Weight
                </Text>
                <Text size="xl" fw={700}>
                  {latestWeight?.value || 'N/A'}
                </Text>
                <Text size="xs" c="dimmed">
                  {latestWeight?.date || ''}
                </Text>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm" bg="rgba(153, 102, 255, 0.05)">
                <Text size="sm" c="dimmed">
                  BMI
                </Text>
                <Text size="xl" fw={700}>
                  {latestBMI?.value || 'N/A'}
                </Text>
                <Text size="xs" c="dimmed">
                  {latestBMI?.date || ''}
                </Text>
              </Card>
            </Grid.Col>
          </Grid>
        </Card>

        {/* Blood Pressure Trends */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Blood Pressure Trends
          </Title>
          {vitals.bloodPressure.length > 0 ? (
            <LineChart chartData={getBpChartData()} />
          ) : (
            <Text c="dimmed">No blood pressure readings available</Text>
          )}
        </Card>

        {/* Conditions */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Conditions
          </Title>
          {conditions.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Condition</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Onset Date</Table.Th>
                  <Table.Th>Recorded Date</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {conditions
                  .filter((c) => c.clinicalStatus?.coding?.[0]?.code === 'active')
                  .sort((a, b) => {
                    const dateA = a.onsetDateTime || a.recordedDate || '';
                    const dateB = b.onsetDateTime || b.recordedDate || '';
                    return dateB.localeCompare(dateA);
                  })
                  .slice(0, 10)
                  .map((condition, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>{condition.code?.coding?.[0]?.display || condition.code?.text || 'Unknown'}</Table.Td>
                    <Table.Td>
                      <Badge color={condition.clinicalStatus?.coding?.[0]?.code === 'active' ? 'red' : 'gray'}>
                        {condition.clinicalStatus?.coding?.[0]?.display || 'Unknown'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{condition.onsetDateTime ? formatDate(condition.onsetDateTime) : 'N/A'}</Table.Td>
                    <Table.Td>{condition.recordedDate ? formatDate(condition.recordedDate) : 'N/A'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">No conditions recorded</Text>
          )}
        </Card>

        {/* Allergies */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Allergies & Intolerances
          </Title>
          {allergies.length > 0 ? (
            <Grid>
              {allergies
                .filter((a) => a.clinicalStatus?.coding?.[0]?.code === 'active')
                .sort((a, b) => {
                  const criticalityOrder: { [key: string]: number } = { high: 0, 'unable-to-assess': 1, low: 2 };
                  const critA = criticalityOrder[a.criticality || 'low'] ?? 1;
                  const critB = criticalityOrder[b.criticality || 'low'] ?? 1;
                  return critA - critB;
                })
                .map((allergy, index) => (
                <Grid.Col key={index} span={{ base: 12, sm: 6, md: 4 }}>
                  <Card withBorder p="sm" bg="rgba(255, 193, 7, 0.05)">
                    <Group justify="space-between" mb="xs">
                      <Text fw={600}>{allergy.code?.coding?.[0]?.display || allergy.code?.text || 'Unknown'}</Text>
                      <Badge 
                        color={
                          allergy.criticality === 'high' ? 'red' : 
                          allergy.criticality === 'low' ? 'yellow' :
                          'orange'
                        } 
                        size="sm"
                      >
                        {allergy.criticality || 'low'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" tt="capitalize">
                      Type: {allergy.type || 'allergy'}
                    </Text>
                    {allergy.category && (
                      <Text size="sm" c="dimmed" tt="capitalize">
                        Category: {allergy.category.join(', ')}
                      </Text>
                    )}
                    {allergy.reaction?.[0] && (
                      <Text size="sm" c="dimmed">
                        Reaction: {allergy.reaction[0].manifestation?.[0]?.text || allergy.reaction[0].manifestation?.[0]?.coding?.[0]?.display || 'N/A'}
                      </Text>
                    )}
                    {allergy.recordedDate && (
                      <Text size="xs" c="dimmed" mt="xs">
                        Recorded: {formatDate(allergy.recordedDate)}
                      </Text>
                    )}
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          ) : (
            <Text c="dimmed">No known allergies</Text>
          )}
        </Card>

        {/* Medications */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Current Medications
          </Title>
          {medications.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Medication</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Dosage</Table.Th>
                  <Table.Th>Prescribed Date</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {medications
                  .filter((m) => m.status === 'active')
                  .sort((a, b) => {
                    const dateA = a.authoredOn || '';
                    const dateB = b.authoredOn || '';
                    return dateB.localeCompare(dateA);
                  })
                  .slice(0, 10)
                  .map((med, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>
                      {med.medicationCodeableConcept?.coding?.[0]?.display ||
                        med.medicationCodeableConcept?.text ||
                        'Unknown'}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={med.status === 'active' ? 'green' : 'gray'}>{med.status || 'Unknown'}</Badge>
                    </Table.Td>
                    <Table.Td>
                      {med.dosageInstruction?.[0]?.text || 
                        `${med.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value || ''} ${med.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.unit || ''}`.trim() || 
                        'See instructions'}
                    </Table.Td>
                    <Table.Td>{med.authoredOn ? formatDate(med.authoredOn) : 'N/A'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">No medications prescribed</Text>
          )}
        </Card>

        {/* Immunizations */}
        <Card withBorder p="md">
          <Title order={2} mb="md">
            Immunization History
          </Title>
          {immunizations.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Vaccine</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Date</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {immunizations
                  .sort((a, b) => {
                    const dateA = a.occurrenceDateTime || '';
                    const dateB = b.occurrenceDateTime || '';
                    return dateB.localeCompare(dateA);
                  })
                  .slice(0, 10)
                  .map((immunization, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>
                      {immunization.vaccineCode?.coding?.[0]?.display || immunization.vaccineCode?.text || 'Unknown'}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={immunization.status === 'completed' ? 'green' : 'gray'}>
                        {immunization.status || 'Unknown'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {immunization.occurrenceDateTime ? formatDate(immunization.occurrenceDateTime) : 'N/A'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">No immunization records</Text>
          )}
        </Card>
      </Stack>
    </Container>
  );
}
