import { ActionIcon, Badge, Box, Button, Card, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconPlayerPlay, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { JSX, useEffect, useRef, useState } from 'react';

interface Note {
  id: string;
  text: string;
  timestamp: Date;
  isRecording?: boolean;
}

interface VoiceNotesProps {
  patientId: string;
}

export function VoiceNotes({ patientId }: VoiceNotesProps): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    // Initialize speech recognition
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      setCurrentTranscript((prev) => prev + finalTranscript || interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert('Microphone access denied. Please allow microphone access to use voice notes.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        // Restart if we're still supposed to be listening
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    // Load saved notes from localStorage
    const savedNotes = localStorage.getItem(`patient-notes-${patientId}`);
    if (savedNotes) {
      const parsed = JSON.parse(savedNotes);
      setNotes(parsed.map((note: Note) => ({ ...note, timestamp: new Date(note.timestamp) })));
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [patientId]);

  useEffect(() => {
    // Save notes to localStorage whenever they change
    if (notes.length > 0) {
      localStorage.setItem(`patient-notes-${patientId}`, JSON.stringify(notes));
    }
  }, [notes, patientId]);

  const startListening = (): void => {
    if (recognitionRef.current && !isListening) {
      setCurrentTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const stopListening = (): void => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);

      // Save the current transcript as a note
      if (currentTranscript.trim()) {
        const newNote: Note = {
          id: Date.now().toString(),
          text: currentTranscript.trim(),
          timestamp: new Date(),
        };
        setNotes((prev) => [newNote, ...prev]);
        setCurrentTranscript('');
      }
    }
  };

  const saveManualNote = (): void => {
    if (currentTranscript.trim()) {
      const newNote: Note = {
        id: Date.now().toString(),
        text: currentTranscript.trim(),
        timestamp: new Date(),
      };
      setNotes((prev) => [newNote, ...prev]);
      setCurrentTranscript('');
    }
  };

  const deleteNote = (id: string): void => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    const remainingNotes = notes.filter((note) => note.id !== id);
    if (remainingNotes.length === 0) {
      localStorage.removeItem(`patient-notes-${patientId}`);
    }
  };

  const formatTimestamp = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  if (!isSupported) {
    return (
      <Card withBorder p="md">
        <Title order={2} mb="md">
          Clinical Notes
        </Title>
        <Text c="red">Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.</Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md">
      <Title order={2} mb="md">
        Clinical Notes
        {isListening && (
          <Badge color="red" variant="filled" size="lg" ml="md" style={{ animation: 'pulse 1.5s infinite' }}>
            Recording...
          </Badge>
        )}
      </Title>

      <Stack gap="md">
        {/* Recording Interface */}
        <Paper withBorder p="md" bg={isListening ? 'rgba(255, 99, 132, 0.05)' : undefined}>
          <Stack gap="md">
            <Textarea
              placeholder={
                isListening
                  ? 'Listening... Speak now'
                  : 'Click the microphone to start recording or type notes manually'
              }
              value={currentTranscript}
              onChange={(e) => setCurrentTranscript(e.currentTarget.value)}
              minRows={4}
              autosize
              disabled={isListening}
            />

            <Group>
              {!isListening ? (
                <>
                  <Button
                    leftSection={<IconMicrophone size={18} />}
                    onClick={startListening}
                    color="red"
                    variant="filled"
                  >
                    Start Voice Recording
                  </Button>
                  {currentTranscript.trim() && (
                    <Button onClick={saveManualNote} variant="outline">
                      Save Note
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  leftSection={<IconMicrophoneOff size={18} />}
                  onClick={stopListening}
                  color="red"
                  variant="filled"
                >
                  Stop Recording
                </Button>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* Notes List */}
        {notes.length > 0 && (
          <Box>
            <Text fw={600} mb="sm">
              Previous Notes ({notes.length})
            </Text>
            <Stack gap="sm">
              {notes.map((note) => (
                <Paper key={note.id} withBorder p="md" bg="rgba(53, 162, 235, 0.02)">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Text size="xs" c="dimmed">
                      {formatTimestamp(note.timestamp)}
                    </Text>
                    <ActionIcon color="red" variant="subtle" onClick={() => deleteNote(note.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  <Text>{note.text}</Text>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {notes.length === 0 && !isListening && (
          <Paper withBorder p="md" bg="rgba(0, 0, 0, 0.02)">
            <Text c="dimmed" ta="center">
              No notes recorded yet. Start recording to add clinical notes.
            </Text>
          </Paper>
        )}
      </Stack>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Card>
  );
}

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    readonly isFinal: boolean;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }
}
