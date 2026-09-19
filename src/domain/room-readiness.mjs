/**
 * Prontidão das missões de uma sala.
 *
 * Regra única, usada pelo servidor (para impedir abrir a sala) e pelo painel
 * (para dizer exatamente o que falta em cada missão):
 *
 * - gabarito: o texto com que o juiz compara a resposta do aluno. No juiz por
 *   critérios é o `reference_text` (o prompt original, nas missões de imagem);
 *   o `expected_result` também conta, porque também chega ao juiz. No juiz
 *   clássico é o `reference_prompt` preservado do pacote-base.
 * - imagem: só é exigida quando a missão é visual — engenharia reversa
 *   (`reversa`), categoria de imagem, ou o juiz clássico, que compara a
 *   resposta com a imagem original. Missão de texto não precisa de imagem.
 *
 * Uma missão sem gabarito é pontuada apenas contra as palavras da missão; uma
 * missão visual sem imagem não tem o que o aluno olhar. Nos dois casos a sala
 * não deve abrir.
 */

const VISUAL_MODALITIES = new Set(['reversa']);
const VISUAL_CATEGORIES = new Set(['imagem', 'reversa', 'classico']);

export const MISSING_LABELS = Object.freeze({
  imagem: 'sem imagem',
  gabarito: 'sem gabarito',
});

export function requiresImage(challenge) {
  if (!challenge) return false;
  if (String(challenge.judgeKind || '') === 'classic') return true;
  const modality = String(challenge.modality || '').toLowerCase();
  const category = String(challenge.category || '').toLowerCase();
  return VISUAL_MODALITIES.has(modality) || VISUAL_CATEGORIES.has(category);
}

export function hasGabarito(challenge) {
  if (!challenge) return false;
  return Boolean(
    String(challenge.referenceText || '').trim()
    || String(challenge.expectedResult || '').trim()
    || String(challenge.referencePrompt || '').trim()
  );
}

/** O que falta nesta missão: [] significa pronta. */
export function missionIssues(challenge) {
  const missing = [];
  if (!challenge) return ['gabarito'];
  if (requiresImage(challenge) && !String(challenge.referenceImage || '').trim()) missing.push('imagem');
  if (!hasGabarito(challenge)) missing.push('gabarito');
  return missing;
}

/**
 * Lista o que impede a sala de abrir, mission por missão.
 * `entries`: [{ position, title, challenge }]
 */
export function roomBlockers(entries = []) {
  return entries
    .map((entry) => ({
      position: Number(entry.position) || 0,
      title: String(entry.title || 'Missão'),
      missing: missionIssues(entry.challenge),
    }))
    .filter((entry) => entry.missing.length > 0);
}

/** Mensagem única para o professor, com cada missão e o que falta nela. */
export function blockersMessage(blockers = []) {
  if (!blockers.length) return '';
  const list = blockers
    .map((entry) => `Missão ${entry.position} — ${entry.title}: ${entry.missing.map((key) => MISSING_LABELS[key] || key).join(' e ')}`)
    .join('; ');
  return `Esta sala ainda não pode abrir. Corrija ${blockers.length === 1 ? 'esta missão' : `estas ${blockers.length} missões`}: ${list}.`;
}
