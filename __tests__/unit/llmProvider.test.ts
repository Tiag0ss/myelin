import {
  applyLlmPrivacyDefaults,
  normalizeLlmProvider,
  openRouterAttributionHeaders,
} from '../../server/utils/llmProvider';

describe('normalizeLlmProvider', () => {
  it('maps known providers', () => {
    expect(normalizeLlmProvider('openai')).toBe('openai');
    expect(normalizeLlmProvider('Ollama')).toBe('ollama');
    expect(normalizeLlmProvider(' openrouter ')).toBe('openrouter');
  });

  it('defaults unknown values to openai', () => {
    expect(normalizeLlmProvider('')).toBe('openai');
    expect(normalizeLlmProvider(null)).toBe('openai');
    expect(normalizeLlmProvider('anthropic')).toBe('openai');
  });
});

describe('applyLlmPrivacyDefaults', () => {
  const baseBody = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hi' }],
  };

  it('sets store=false for OpenAI', () => {
    expect(applyLlmPrivacyDefaults('openai', baseBody)).toEqual({
      ...baseBody,
      store: false,
    });
  });

  it('denies data collection for OpenRouter without forcing ZDR by default', () => {
    expect(applyLlmPrivacyDefaults('openrouter', baseBody)).toEqual({
      ...baseBody,
      provider: {
        data_collection: 'deny',
      },
    });
  });

  it('adds zdr when OpenRouter ZDR is required', () => {
    expect(
      applyLlmPrivacyDefaults('openrouter', baseBody, { openRouterRequireZdr: true })
    ).toEqual({
      ...baseBody,
      provider: {
        data_collection: 'deny',
        zdr: true,
      },
    });
  });

  it('leaves Ollama bodies unchanged', () => {
    expect(applyLlmPrivacyDefaults('ollama', baseBody)).toEqual(baseBody);
  });
});

describe('openRouterAttributionHeaders', () => {
  const originalBase = process.env.APP_BASE_URL;
  const originalPublic = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalBase === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = originalBase;
    if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalPublic;
  });

  it('uses APP_BASE_URL without trailing slash', () => {
    process.env.APP_BASE_URL = 'https://pm.example.com/';
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(openRouterAttributionHeaders()).toMatchObject({
      'HTTP-Referer': 'https://pm.example.com',
      'X-OpenRouter-Title': 'Myelin',
      'X-Title': 'Myelin',
    });
  });
});
