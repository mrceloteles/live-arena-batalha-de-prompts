// A política de repetição dos juízes externos, num lugar só.
//
// Por que existe: medido em 17/09/2026 (`npm run carga:http -- --falha-provedor
// 429`, 6 alunos), um 429 do provedor virava nota LOCAL em **6 de 6** submissões
// no modo `gemini` — a turma recebia heurística com cara de avaliação, sem o
// aluno ver diferença. A decisão anterior ("429 = cota esgotada, repetir não
// ajuda") fazia sentido para cota mensal e estava errada para limite POR MINUTO,
// que é o caso comum: cota por minuto volta em segundos.
//
// Agora as duas famílias repetem 429 e 5xx com espera, e só depois disso o modo
// que promete fallback cai no local. A espera respeita `Retry-After` quando o
// provedor manda e tem TETO, para uma avaliação não ficar parada: o aluno já
// recebeu "pendente" (o servidor responde em `SUBMIT_WAIT_MS`) e a nota chega
// pela consulta de estado, então esperar é barato — mas não infinito.
// O navegador do fluxo clássico espera 12 s por uma resposta (`public/assets/js/
// app.js`: `timeout ?? 12000`) e ainda repete por conta própria. Uma repetição no
// juiz tem de caber nesse prazo, senão o usuário vê uma falha que o servidor não
// cometeu — o defeito de "timeout enganoso" que a Arena resolveu com resposta
// pendente. 1 s de folga: o resto é transporte.
export const CLASSIC_DEADLINE_MS = 11_000;

export const JUDGE_RETRY_LIMITS = Object.freeze({
  // Tentativas EXTRAS depois da primeira. Uma espera resolve o que duas
  // tentativas coladas não resolviam, e o pior caso é `retries x timeout`.
  retries: 1,
  // Espera base para 5xx/timeout: um blip não precisa de segundo inteiro.
  baseDelayMs: 150,
  // Espera base para 429: cota costuma voltar em segundos, não em milissegundos.
  rateLimitDelayMs: 1_000,
  // Teto da espera, mesmo se o provedor mandar `Retry-After` maior.
  maxWaitMs: 2_000,
  // Prazo total de uma avaliação COM repetição, para o juiz não viver mais que a
  // paciência de quem chamou. No fluxo da Arena ninguém bloqueia nele (o aluno
  // recebe "pendente" e a nota chega pela consulta de estado); no fluxo clássico
  // o navegador aborta em 12 s, e cada adaptador declara o próprio prazo.
  deadlineMs: 30_000,
});

// O que se repete. 429 (cota) e 5xx (defeito do provedor) são passageiros; 4xx
// de pedido/chave não são — repetir só gastaria cota e atrasaria o fallback.
export function retryableStatus(status) {
  const codigo = Number(status);
  return codigo === 429 || codigo >= 500;
}

// `Retry-After` em segundos ou como data HTTP. Devolve 0 quando não há (ou
// quando o cabeçalho não é parseável), que é o sinal para usar a espera padrão.
export function retryAfterMs(response) {
  const bruto = response?.headers?.get?.('retry-after');
  if (!bruto) return 0;
  const texto = String(bruto).trim();
  const segundos = Number(texto);
  if (Number.isFinite(segundos)) return Math.max(0, Math.round(segundos * 1000));
  const data = Date.parse(texto);
  return Number.isFinite(data) ? Math.max(0, data - Date.now()) : 0;
}

// Quanto esperar antes da tentativa `attempt + 1`.
//
// O maior entre a espera do provedor e a exponencial da família: um
// `Retry-After: 5` não pode ser encurtado para 150 ms (repetiria na hora, contra
// a instrução de quem sabe quando a cota volta), e um `Retry-After: 3600` não
// pode segurar a avaliação por uma hora — daí o teto.
// Cabe mais uma tentativa? Duas perguntas, nessa ordem: ainda há repetição
// autorizada, e ainda há TEMPO para ela dentro do prazo de quem chamou?
//
// Sem a segunda pergunta, o adaptador viveria mais que o cliente e o usuário
// veria uma falha que o servidor não cometeu — o mesmo defeito de "timeout
// enganoso" que fez o servidor da Arena responder "pendente" em vez de estourar
// o prazo. A conta inclui o pior caso da próxima tentativa (`attemptTimeoutMs`),
// não só a espera: repetir e estourar o prazo é pior que não repetir.
//
// `deadlineMs <= 0` significa "sem prazo", e aí a decisão é só do `retries`.
export function hasTimeForRetry({
  attempt = 0,
  retries = JUDGE_RETRY_LIMITS.retries,
  elapsedMs = 0,
  waitMs = 0,
  attemptTimeoutMs = 0,
  deadlineMs = JUDGE_RETRY_LIMITS.deadlineMs,
} = {}) {
  if (attempt >= retries) return false;
  if (!(deadlineMs > 0)) return true;
  return elapsedMs + waitMs + attemptTimeoutMs <= deadlineMs;
}

export function waitBeforeRetry({
  attempt = 0,
  status,
  retryAfter = 0,
  baseDelayMs = JUDGE_RETRY_LIMITS.baseDelayMs,
  rateLimitDelayMs = JUDGE_RETRY_LIMITS.rateLimitDelayMs,
  maxWaitMs = JUDGE_RETRY_LIMITS.maxWaitMs,
} = {}) {
  const base = Number(status) === 429 ? rateLimitDelayMs : baseDelayMs;
  const exponencial = base * 2 ** Math.max(0, attempt);
  return Math.min(maxWaitMs, Math.max(exponencial, Number(retryAfter) || 0, 0));
}
