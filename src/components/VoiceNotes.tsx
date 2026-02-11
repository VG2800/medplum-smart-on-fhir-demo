import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBrain, IconMicrophone, IconMicrophoneOff, IconTrash } from '@tabler/icons-react';
import { JSX, useEffect, useRef, useState } from 'react';
import { isAIAvailable, summarizeNote } from '../utils/aiSummarizer';

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
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizingNoteId, setSummarizingNoteId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
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

    // Load API key from localStorage
    const savedApiKey = localStorage.getItem('openai-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
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

  const summarizeCurrentTranscript = async (): Promise<void> => {
    if (!currentTranscript.trim()) return;

    setIsSummarizing(true);
    try {
      const summarized = await summarizeNote({
        text: currentTranscript,
        apiKey: apiKey || undefined,
      });
      setCurrentTranscript(summarized);
    } catch (error) {
      alert('Failed to summarize note. Using local cleanup instead.');
      // Fallback to local summarizer
      const summarized = await summarizeNote({
        text: currentTranscript,
        apiKey: undefined,
      });
      setCurrentTranscript(summarized);
    } finally {
      setIsSummarizing(false);
    }
  };

  const summarizeExistingNote = async (noteId: string): Promise<void> => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    setSummarizingNoteId(noteId);
    try {
      const summarized = await summarizeNote({
        text: note.text,
        apiKey: apiKey || undefined,
      });

      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                text: summarized,
              }
            : n
        )
      );
    } catch (error) {
      alert('Failed to summarize note. Using local cleanup instead.');
      const summarized = await summarizeNote({
        text: note.text,
        apiKey: undefined,
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                text: summarized,
              }
            : n
        )
      );
    } finally {
      setSummarizingNoteId(null);
    }
  };

  const saveApiKey = (): void => {
    localStorage.setItem('openai-api-key', apiKey);
    closeSettings();
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
      <Group justify="space-between" mb="md">
        <Group>
          <Title order={2}>Clinical Notes</Title>
          {isListening && (
            <Badge color="red" variant="filled" size="lg" style={{ animation: 'pulse 1.5s infinite' }}>
              Recording...
            </Badge>
          )}
        </Group>
        <Tooltip label="AI Settings (Optional)">
          <Button size="xs" variant="light" onClick={openSettings}>
            AI Settings
          </Button>
        </Tooltip>
      </Group>

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
                    <>
                      <Button
                        leftSection={isSummarizing ? <Loader size="xs" /> : <IconBrain size={18} />}
                        onClick={summarizeCurrentTranscript}
                        variant="light"
                        color="blue"
                        disabled={isSummarizing}
                      >
                        {isSummarizing ? 'Summarizing...' : 'AI Summarize'}
                      </Button>
                      <Button onClick={saveManualNote} variant="outline">
                        Save Note
                      </Button>
                    </>
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
                    <Group gap="xs">
                      <Tooltip label="Summarize with AI">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          onClick={() => summarizeExistingNote(note.id)}
                          disabled={summarizingNoteId === note.id}
                        >
                          {summarizingNoteId === note.id ? <Loader size="xs" /> : <IconBrain size={16} />}
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon color="red" variant="subtle" onClick={() => deleteNote(note.id)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{note.text}</Text>
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

      {/* AI Settings Modal */}
      <Modal opened={settingsOpened} onClose={closeSettings} title="AI Summarizer Settings" size="md">
        <Stack>
          <Text size="sm" c="dimmed">
            Configure OpenAI API for better AI-powered note summarization. Without an API key, basic local text cleanup
            will be used instead.
          </Text>

          <TextInput
            label="OpenAI API Key (Optional)"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
            type="password"
            description="Your API key is stored locally in your browser and never sent to our servers."
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeSettings}>
              Cancel
            </Button>
            <Button onClick={saveApiKey}>Save Settings</Button>
          </Group>

          <Divider my="xs" />

          <Text size="xs" c="dimmed">
            {isAIAvailable(apiKey)
              ? '✓ AI Summarization is available'
              : '○ Using local text cleanup (no AI API configured)'}
          </Text>
          <Text size="xs" c="dimmed">
            Get your API key from:{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              https://platform.openai.com/api-keys
            </a>
          </Text>
        </Stack>
      </Modal>
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
