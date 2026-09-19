import { createJudge } from '../../src/judge/judge.mjs';

export class PackageExactGeminiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'PackageExactGeminiError';
    this.status = status;
  }
}

export const PACKAGE_EXACT_CONFIG = Object.freeze({
  model: 'gemini-2.0-flash',
  temperature: 0.1,
  maxOutputTokens: 10,
  timeoutMs: 8_000,
});

// Intentionally mirrors the user-supplied batalha_prompt.zip api.php wording.
// Do not use this prompt as the pedagogical/security-hardened production judge.
export function packageExactInstruction({ referencePrompt, candidatePrompt }) {
  return `Você é um juiz de precisão semântica para uma Batalha de Prompts de IA.
Compare o prompt de referência (original) com o prompt escrito pelo jogador.
Avalie a proximidade semântica, elementos descritivos (sujeito, estilo, iluminação, ambiente, câmera, detalhes).
Responda EXCLUSIVAMENTE com um número de 0 a 100 representando a porcentagem de precisão/acerto (exemplo: 78.5). Não inclua nenhum outro texto ou símbolo.

Prompt Original: "${referencePrompt}"
Prompt do Jogador: "${candidatePrompt}"`;
}

export function parsePackageExactPercent(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  const match = text.trim().match(/(\d+(?:\.\d+)?)/u);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(Math.max(value, 0), 100) * 10_000) / 10_000;
}

export function createPackageExactGeminiCandidate({
  apiKey,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  model = PACKAGE_EXACT_CONFIG.model,
  timeoutMs = PACKAGE_EXACT_CONFIG.timeoutMs,
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey) throw new TypeError('Gemini apiKey is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  return createJudge(async (input) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: packageExactInstruction(input) }] }],
          generationConfig: {
            temperature: PACKAGE_EXACT_CONFIG.temperature,
            maxOutputTokens: PACKAGE_EXACT_CONFIG.maxOutputTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PackageExactGeminiError(`Gemini request failed with HTTP ${response.status}`, { status: response.status });
      }
      const payload = await response.json();
      const percent = parsePackageExactPercent(payload);
      if (percent === null) throw new PackageExactGeminiError('Gemini returned no parseable numeric score');
      return {
        percent,
        explanation: 'Candidato de pesquisa que replica o prompt/configuração Gemini do pacote batalha_prompt.zip.',
        metadata: {
          provider: 'gemini',
          candidate: 'package-exact-gemini-v1',
          model,
          modelVersion: payload?.modelVersion ?? null,
          temperature: PACKAGE_EXACT_CONFIG.temperature,
          maxOutputTokens: PACKAGE_EXACT_CONFIG.maxOutputTokens,
          timeoutMs,
        },
      };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new PackageExactGeminiError('Gemini package-exact candidate timed out', { cause: error });
      }
      if (error instanceof PackageExactGeminiError) throw error;
      throw new PackageExactGeminiError('Gemini package-exact candidate failed', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  });
}
