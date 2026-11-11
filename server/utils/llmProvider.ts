import { pool, RowDataPacket } from '../config/database';
import { decrypt } from './encryption';
import logger from './logger';

export type LlmProvider = 'openai' | 'ollama' | 'openrouter';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmConfig = {
  provider: LlmProvider;
  aiAssistantEnabled: boolean;
  isConfigured: boolean;
  /** Resolved chat model for the active provider. */
  model: string;
  behavior: string;
  openAiApiKey: string;
  openAIModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export function normalizeLlmProvider(value: string | undefined | null): LlmProvider {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ollama') return 'ollama';
  if (normalized === 'openrouter') return 'openrouter';
  return 'openai';
}

function normalizeOllamaBaseUrl(value: string | undefined | null): string {
  const raw = String(value || '').trim() || DEFAULT_OLLAMA_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function resolveAppReferer(): string {
  const raw = String(
    process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://myelin.local'
  ).trim();
  return raw.replace(/\/+$/, '') || 'https://myelin.local';
}

/**
 * OpenRouter attribution headers (rankings / analytics). Title is required when
 * using localhost referers.
 */
export function openRouterAttributionHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': resolveAppReferer(),
    'X-OpenRouter-Title': 'Myelin',
    // Legacy header still accepted by OpenRouter.
    'X-Title': 'Myelin',
  };
}

/**
 * Privacy defaults so cloud providers do not use prompts for training / long retention.
 * - OpenAI: `store: false` (no distillation/evals storage; API data is not used for training by default).
 * - OpenRouter: `data_collection: deny` + `zdr: true` (no training-capable / non-ZDR endpoints).
 * - Ollama: local — no cloud privacy flags.
 */
export function applyLlmPrivacyDefaults(
  provider: LlmProvider,
  body: Record<string, unknown>
): Record<string, unknown> {
  if (provider === 'openai') {
    return { ...body, store: false };
  }
  if (provider === 'openrouter') {
    return {
      ...body,
      provider: {
        data_collection: 'deny',
        zdr: true,
      },
    };
  }
  return body;
}

export function resolveChatCompletionEndpoint(config: LlmConfig): {
  url: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.provider === 'ollama') {
    headers.Authorization = 'Bearer ollama';
    return { url: `${config.ollamaBaseUrl}/v1/chat/completions`, headers };
  }

  if (config.provider === 'openrouter') {
    headers.Authorization = `Bearer ${config.openRouterApiKey}`;
    Object.assign(headers, openRouterAttributionHeaders());
    return { url: OPENROUTER_CHAT_URL, headers };
  }

  headers.Authorization = `Bearer ${config.openAiApiKey}`;
  return { url: OPENAI_CHAT_URL, headers };
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingKey, SettingValue FROM SystemSettings
     WHERE SettingKey IN (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'aiAssistantEnabled',
      'aiProvider',
      'openAIApiKey',
      'openAIModel',
      'openAIBehavior',
      'ollamaBaseUrl',
      'ollamaModel',
      'openRouterApiKey',
      'openRouterModel',
    ]
  );

  const settingsMap: Record<string, string> = {};
  rows.forEach((row: RowDataPacket) => {
    settingsMap[String(row.SettingKey)] = String(row.SettingValue || '');
  });

  const provider = normalizeLlmProvider(settingsMap.aiProvider);
  const encryptedOpenAiKey = String(settingsMap.openAIApiKey || '').trim();
  const openAiApiKey = encryptedOpenAiKey ? decrypt(encryptedOpenAiKey).trim() : '';
  const openAIModel = String(settingsMap.openAIModel || '').trim() || DEFAULT_OPENAI_MODEL;
  const ollamaBaseUrl = normalizeOllamaBaseUrl(settingsMap.ollamaBaseUrl);
  const ollamaModel = String(settingsMap.ollamaModel || '').trim() || DEFAULT_OLLAMA_MODEL;
  const encryptedOpenRouterKey = String(settingsMap.openRouterApiKey || '').trim();
  const openRouterApiKey = encryptedOpenRouterKey
    ? decrypt(encryptedOpenRouterKey).trim()
    : '';
  const openRouterModel =
    String(settingsMap.openRouterModel || '').trim() || DEFAULT_OPENROUTER_MODEL;
  const behavior = String(settingsMap.openAIBehavior || '').trim();
  const aiAssistantEnabled = settingsMap.aiAssistantEnabled === 'true';

  let isConfigured = false;
  let model = openAIModel;
  if (provider === 'ollama') {
    isConfigured = Boolean(ollamaBaseUrl && ollamaModel);
    model = ollamaModel;
  } else if (provider === 'openrouter') {
    isConfigured = Boolean(openRouterApiKey);
    model = openRouterModel;
  } else {
    isConfigured = Boolean(openAiApiKey);
    model = openAIModel;
  }

  return {
    provider,
    aiAssistantEnabled,
    isConfigured,
    model,
    behavior,
    openAiApiKey,
    openAIModel,
    ollamaBaseUrl,
    ollamaModel,
    openRouterApiKey,
    openRouterModel,
  };
}

export function llmNotConfiguredMessage(config: LlmConfig): string {
  if (config.provider === 'ollama') {
    return 'Ollama is not configured. Set Base URL and model in System Settings.';
  }
  if (config.provider === 'openrouter') {
    return 'OpenRouter API key is not configured in system settings.';
  }
  return 'OpenAI API key is not configured in system settings.';
}

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Override model from config when needed. */
  model?: string;
  /** Abort the provider request after this many ms (default 120s). */
  timeoutMs?: number;
};

const DEFAULT_CHAT_TIMEOUT_MS = 120_000;

/**
 * Shrink HTML before sending to an LLM: drop huge base64 images that blow up
 * prompt size (common in TipTap patch notes) and optionally truncate.
 */
export function prepareHtmlForLlm(html: string, maxChars = 60_000): string {
  let out = String(html || '')
    .replace(/<img\b[^>]*\bsrc=["']data:image\/[^"']+["'][^>]*>/gi, '<p><em>[image omitted]</em></p>')
    .replace(/\bsrc=["']data:image\/[^"']+["']/gi, 'src=""');
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}\n<!-- truncated for LLM -->`;
  }
  return out;
}

export type ChatCompletionResult = {
  content: string;
  provider: LlmProvider;
  model: string;
};

function providerUnreachableMessage(config: LlmConfig, detail: string): string {
  if (config.provider === 'ollama') {
    return `Cannot reach Ollama at ${config.ollamaBaseUrl}. Is Ollama running? (${detail})`;
  }
  if (config.provider === 'openrouter') {
    return `Cannot reach OpenRouter API. (${detail})`;
  }
  return `Cannot reach OpenAI API. (${detail})`;
}

function providerRequestFailedFallback(config: LlmConfig): string {
  if (config.provider === 'ollama') {
    return 'Ollama request failed. Check Base URL, model name, and that the model is pulled.';
  }
  if (config.provider === 'openrouter') {
    return 'OpenRouter request failed. Check API key, model id, and that the route supports data_collection=deny / ZDR.';
  }
  return 'OpenAI request failed. Check API key and model configuration.';
}

/**
 * Call the configured LLM provider using the OpenAI-compatible chat completions API.
 * Ollama and OpenRouter expose the same shape at their `/v1/chat/completions` endpoints.
 */
export async function chatCompletion(
  config: LlmConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  if (!config.isConfigured) {
    throw new Error(llmNotConfiguredMessage(config));
  }

  const model = String(options.model || config.model).trim();
  const temperature = options.temperature ?? 0.2;
  let body: Record<string, unknown> = {
    model,
    temperature,
    messages: options.messages,
  };
  if (typeof options.maxTokens === 'number' && options.maxTokens > 0) {
    body.max_tokens = options.maxTokens;
  }
  body = applyLlmPrivacyDefaults(config.provider, body);

  const { url, headers } = resolveChatCompletionEndpoint(config);

  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_CHAT_TIMEOUT_MS;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const timedOut =
      (error instanceof Error && error.name === 'TimeoutError') ||
      /aborted|timeout/i.test(detail);
    logger.error('LLM request network error', {
      provider: config.provider,
      url,
      error: detail,
      elapsedMs: Date.now() - startedAt,
      timedOut,
    });
    if (timedOut) {
      throw new Error(
        `LLM request timed out after ${Math.round(timeoutMs / 1000)}s. Try shorter notes or a faster model.`
      );
    }
    throw new Error(providerUnreachableMessage(config, detail));
  }

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const apiMessage = String(
      (errorJson as { error?: { message?: string }; message?: string })?.error?.message ||
        (errorJson as { message?: string })?.message ||
        ''
    ).trim();
    throw new Error(apiMessage || providerRequestFailedFallback(config));
  }

  const llmJson = await response.json();
  const content = String(
    (llmJson as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
      ?.message?.content || ''
  ).trim();
  logger.info('LLM chat completion ok', {
    provider: config.provider,
    model,
    elapsedMs: Date.now() - startedAt,
    contentChars: content.length,
  });
  return { content, provider: config.provider, model };
}
