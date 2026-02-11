import { Button, Container, Divider, Stack, Text, Title } from '@mantine/core';
import { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  FHIR_SCOPE,
  MEDPLUM_AUTH_URL,
  MEDPLUM_CLIENT_ID,
  SMART_HEALTH_IT_AUTH_URL,
  SMART_HEALTH_IT_CLIENT_ID,
} from '../config';

interface SmartLaunchProps {
  clientId: string;
  iss: string;
  children: React.ReactNode;
}

function SmartLaunch({ clientId, iss, children }: SmartLaunchProps): JSX.Element {
  const handleClick = (): void => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: FHIR_SCOPE,
      redirect_uri: window.location.origin + '/launch',
      state: crypto.randomUUID(),
      aud: iss,
    });

    window.location.href = `${iss}?${params.toString()}`;
  };

  return <div onClick={handleClick}>{children}</div>;
}

export function HomePage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container size="md" mt="xl">
      <Stack>
        <Title order={1}>Medplum SMART on FHIR Demo</Title>
        <Text>
          This is a demonstration of SMART on FHIR capabilities using Medplum. You can launch this app from any
          SMART-enabled EHR system.
        </Text>

        <Divider my="md" label="View Sample Patient Data" labelPosition="center" />

        <Button size="lg" variant="filled" onClick={() => navigate('/patient')}>
          View Patient Dashboard (Local Data)
        </Button>

        <Text size="sm" c="dimmed" ta="center">
          View comprehensive patient data from local JSON files
        </Text>

        <Divider my="md" label="Or Launch with SMART on FHIR" labelPosition="center" />

        <Text>To test the app with live data, you can use one of these launch options:</Text>

        <SmartLaunch clientId={MEDPLUM_CLIENT_ID} iss={MEDPLUM_AUTH_URL}>
          <Button>Launch with Medplum</Button>
        </SmartLaunch>

        <SmartLaunch clientId={SMART_HEALTH_IT_CLIENT_ID} iss={SMART_HEALTH_IT_AUTH_URL}>
          <Button>Launch with SMART Health IT Sandbox</Button>
        </SmartLaunch>
      </Stack>
    </Container>
  );
}
