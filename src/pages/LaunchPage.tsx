import { Container, Loader, Text } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { useMedplumContext } from '@medplum/react';
import { JSX, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { FHIR_SCOPE, MEDPLUM_CLIENT_ID, SMART_HEALTH_IT_CLIENT_ID } from '../config';

interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
}

interface TokenResponse {
  access_token: string;
  patient: string;
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function getClientId(params: URLSearchParams, iss: string): string {
  // First try to get from URL params
  const clientId = params.get('client_id');
  if (clientId) {
    return clientId;
  }

  // Otherwise determine based on issuer domain
  const issuerUrl = new URL(iss);
  const allowedHosts = ['smarthealthit.org'];
  if (allowedHosts.includes(issuerUrl.hostname)) {
    return SMART_HEALTH_IT_CLIENT_ID;
  }

  // Default to Medplum client ID
  return MEDPLUM_CLIENT_ID;
}

async function fetchSmartConfiguration(iss: string): Promise<SmartConfiguration> {
  // Special handling for Medplum
  if (iss.includes('medplum.com')) {
    return {
      authorization_endpoint: 'https://api.medplum.com/oauth2/authorize',
      token_endpoint: 'https://api.medplum.com/oauth2/token',
    };
  }

  // Try standard SMART configuration endpoint
  const configUrl = `${iss}/.well-known/smart-configuration`;
  const response = await fetch(configUrl, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SMART configuration from ${configUrl}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function initiateEhrLaunch(params: URLSearchParams): Promise<never> {
  const iss = params.get('iss');
  const launch = params.get('launch');

  if (!iss) {
    throw new Error('Missing iss parameter for EHR launch');
  }

  // Store the issuer for later use
  sessionStorage.setItem('smart_iss', iss);

  const config = await fetchSmartConfiguration(iss);

  // Generate and store state for verification
  const state = crypto.randomUUID();
  sessionStorage.setItem('smart_state', state);

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  sessionStorage.setItem('smart_code_verifier', codeVerifier);

  // Get the appropriate client ID
  const clientId = getClientId(params, iss);

  // Redirect to authorization endpoint
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: FHIR_SCOPE,
    redirect_uri: window.location.origin + '/launch',
    state,
    aud: iss,
    launch: launch as string,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = new URL(config.authorization_endpoint);
  url.search = authParams.toString();
  window.location.href = url.toString();
  return new Promise(() => {}); // This promise never resolves due to redirect
}

function validateAuthResponse(params: URLSearchParams): void {
  const code = params.get('code');
  const state = params.get('state');
  const storedState = sessionStorage.getItem('smart_state');

  const missing = [];
  if (!code) {
    missing.push('code');
  }
  if (!state) {
    missing.push('state');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required parameters in authorization response: ${missing.join(', ')}`);
  }

  if (state !== storedState) {
    console.error('State mismatch:', { received: state, stored: storedState });
    throw new Error('State parameter mismatch - possible session expired. Please try launching the app again.');
  }
}

async function exchangeCodeForToken(
  params: URLSearchParams,
  config: SmartConfiguration,
  clientId: string
): Promise<TokenResponse> {
  const code = params.get('code');
  const codeVerifier = sessionStorage.getItem('smart_code_verifier');
  
  if (!codeVerifier) {
    throw new Error('Missing code verifier - session may have expired');
  }
  
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code as string,
    redirect_uri: window.location.origin + '/launch',
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  
  console.log('Token exchange request:', {
    endpoint: config.token_endpoint,
    body: Object.fromEntries(tokenBody.entries()),
  });
  
  const tokenResponse = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      body: errorText,
    });
    throw new Error(`Failed to get access token: ${tokenResponse.status} ${errorText}`);
  }

  return tokenResponse.json();
}

function setupMedplumClient(tokenData: TokenResponse, iss: string, medplumContext: { medplum: MedplumClient }): void {
  // Store the access token and other relevant data
  sessionStorage.setItem('smart_patient', tokenData.patient);
  sessionStorage.setItem('smart_access_token', tokenData.access_token);
  sessionStorage.setItem('smart_base_url', iss);

  // Configure the Medplum client
  medplumContext.medplum = new MedplumClient({
    baseUrl: iss,
    fhirUrlPath: '',
    accessToken: tokenData.access_token,
  });
}

export function LaunchPage(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const medplumContext = useMedplumContext();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent running twice (strict mode or navigation back)
    if (hasInitialized.current) {
      return;
    }

    const handleSmartLaunch = async (): Promise<void> => {
      try {
        const params = new URLSearchParams(window.location.search);
        
        console.log('Launch page params:', Object.fromEntries(params.entries()));
        
        // Check for OAuth error response
        const error = params.get('error');
        const errorDescription = params.get('error_description');
        if (error) {
          throw new Error(`OAuth error: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`);
        }

        const launch = params.get('launch');
        const code = params.get('code');

        // Only check for existing auth if we have launch params (not just navigating back)
        if (!launch && !code) {
          // No SMART launch params, redirect to home
          console.log('No SMART launch params, redirecting to home');
          navigate('/');
          return;
        }

        // Check if we're already authenticated and redirect to patient page
        const existingToken = sessionStorage.getItem('smart_access_token');
        const existingPatient = sessionStorage.getItem('smart_patient');
        
        if (existingToken && existingPatient && !launch && !code) {
          console.log('Already authenticated, redirecting to patient page');
          navigate('/patient');
          return;
        }

        if (launch) {
          console.log('Starting EHR launch with iss:', params.get('iss'));
          await initiateEhrLaunch(params);
          return;
        }

        // Handle authorization response
        console.log('Processing authorization response');
        validateAuthResponse(params);

        const iss = sessionStorage.getItem('smart_iss');
        if (!iss) {
          throw new Error('No issuer found in session storage');
        }

        const config = await fetchSmartConfiguration(iss);
        const clientId = getClientId(params, iss);
        const tokenData = await exchangeCodeForToken(params, config, clientId);

        // Clean up session storage
        sessionStorage.removeItem('smart_state');
        sessionStorage.removeItem('smart_iss');
        sessionStorage.removeItem('smart_code_verifier');

        setupMedplumClient(tokenData, iss, medplumContext);

        // Mark as initialized before navigating
        hasInitialized.current = true;

        // Redirect to patient page
        navigate('/patient')?.catch(console.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    hasInitialized.current = true;
    handleSmartLaunch().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unknown error');
    });
  }, [navigate, medplumContext]);

  if (error) {
    return (
      <Container>
        <Text ta="center" c="red" mt="xl">
          Error: {error}
        </Text>
      </Container>
    );
  }

  return (
    <Container>
      <Text ta="center" mt="xl">
        Launching SMART on FHIR app...
      </Text>
      <Loader size="xl" mt="xl" />
    </Container>
  );
}
