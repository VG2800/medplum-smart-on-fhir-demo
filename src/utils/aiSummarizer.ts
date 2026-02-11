// AI Summarizer using OpenAI API or local fallback
// You can replace this with any AI service (OpenAI, Anthropic, local LLM, etc.)

export interface SummarizeOptions {
  text: string;
  apiKey?: string;
  model?: string;
}

export async function summarizeNote(options: SummarizeOptions): Promise<string> {
  const { text, apiKey, model = 'gpt-3.5-turbo' } = options;

  // If no API key, use local fallback
  if (!apiKey || apiKey.trim() === '') {
    return localSummarizer(text);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a medical scribe assistant. Clean up and structure clinical notes from speech-to-text transcription. Fix grammar, organize information logically, use proper medical terminology, and format as clear bullet points or paragraphs. Keep all medical details accurate. Be concise but comprehensive.',
          },
          {
            role: 'user',
            content: `Please clean up and structure this clinical note:\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to summarize');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI summarization error:', error);
    throw error;
  }
}

// Local fallback summarizer (basic text cleanup without AI API)
function localSummarizer(text: string): string {
  // Basic text cleanup
  let cleaned = text.trim();

  // Capitalize first letter of sentences
  cleaned = cleaned.replace(/(^\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());

  // Add periods at the end if missing
  if (!cleaned.match(/[.!?]$/)) {
    cleaned += '.';
  }

  // Fix common speech-to-text issues
  cleaned = cleaned.replace(/\s+/g, ' '); // Multiple spaces
  cleaned = cleaned.replace(/\s+([.,!?])/g, '$1'); // Space before punctuation

  // Add basic structure
  const sentences = cleaned.split(/([.!?]\s+)/);
  const organized = sentences
    .filter((s) => s.trim().length > 0)
    .map((s, i) => {
      if (i % 2 === 0 && s.trim().length > 3) {
        return `• ${s.trim()}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  return organized || cleaned;
}

// Check if AI summarization is available
export function isAIAvailable(apiKey?: string): boolean {
  return !!apiKey && apiKey.trim() !== '';
}
