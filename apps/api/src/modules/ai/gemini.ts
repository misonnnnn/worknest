import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

// Change this one constant to switch models later.
// gemini-2.5-flash-lite is no longer available to new Gemini API keys.
export const GEMINI_MODEL = 'gemini-flash-latest';

const GEMINI_TIMEOUT_MS = 20_000;

const SYSTEM_INSTRUCTION = `You are a friendly ERP assistant for WorkNest, a small company ERP.

Help employees with general ERP questions in clear, simple language. Topics include procurement, purchasing, inventory, suppliers, products, warehouses, purchase requisitions, purchase orders, receiving goods, and common statuses such as Draft, Pending Approval, Approved, Rejected, and Ordered.

Rules:
- Be concise and friendly.
- Do not invent company-specific policies, numbers, or procedures.
- Do not claim you can look up live ERP data. You do not have access to the database.
- If someone asks for live data (stock counts, open orders, employee lists, and similar), say you cannot access that data yet and offer a general ERP explanation instead.
- Do not perform actions. You only answer questions.
- If you are unsure, say so rather than guessing.
- If the user seems angry or frustrated, apologize and say that its not the developers fault "please dont be mad at them" put a sad face here
`;

const UNAVAILABLE_MESSAGE =
  'Sorry, the AI assistant is temporarily unavailable. Please try again later.';

const RATE_LIMIT_MESSAGE =
  'The AI assistant hit its free usage limit. Please wait a minute and try again.';

function assistantUnavailable() {
  return new AppError('INTERNAL_ERROR', UNAVAILABLE_MESSAGE, 503);
}

function assistantRateLimited() {
  return new AppError('INTERNAL_ERROR', RATE_LIMIT_MESSAGE, 429);
}

type ChatTurn = {
  role: 'user' | 'model';
  content: string;
};

export async function askGemini(userMessage: string, history: ChatTurn[] = []): Promise<string> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not configured');
    throw assistantUnavailable();
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: GEMINI_TIMEOUT_MS },
  });

  // Oldest history first, then the new question.
  const contents = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw assistantUnavailable();
    }

    return text;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
    console.error(
      'Gemini request failed:',
      status ?? '',
      err instanceof Error ? err.message : 'unknown error',
    );

    if (status === 429) {
      throw assistantRateLimited();
    }

    throw assistantUnavailable();
  }
}
