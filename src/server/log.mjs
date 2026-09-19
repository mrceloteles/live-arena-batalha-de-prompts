// Log de falha correlacionável — e sem dado de aluno dentro.
//
// O defeito registrado na auditoria: erro interno virava 500 genérico sem
// nenhuma linha de log que alguém pudesse ligar ao relato de um aluno. A partir
// daqui toda falha da API sai numa linha JSON com o id da requisição, e o mesmo
// id volta no cabeçalho `x-request-id` — quem relata vê o id, quem opera acha a
// linha.
//
// O que NUNCA entra na linha, e por quê:
//   - o payload: ele carrega o PIN da sala, o token do aluno e o prompt escrito
//     (texto de criança em log é dado pessoal, e o PIN é credencial de entrada);
//   - valores de ambiente sensíveis (senha do painel, segredo da sessão, chave
//     do Gemini, token do Turso): mesmo que apareçam dentro de uma mensagem de
//     erro, são substituídos;
//   - o nome do aluno, e-mail, empresa: não vêm por nenhum caminho daqui, e o
//     teste do módulo prende isso.
//
// Também não existe quebra de linha dentro de um campo: um `room_id` forjado não
// pode inventar uma linha nova no log (log injection).

const TEXTO_SIMPLES = /^[A-Za-z0-9._:\-/ ]{1,120}$/;
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
const REDIGIDO = '[redigido]';
/** Campos que, no topo do registro, não podem sair em claro. */
const CHAVES_SENSIVEIS = /^(payload|admin_token|admin_password|password|senha|secret|segredo|token|tv_token|authorization|cookie|api_key|apikey|gemini_api_key|turso_auth_token|prompt|email|nome)$/i;

/**
 * Escreve o registro em uma linha só. O serializador do JSON já escapa quebra
 * de linha DENTRO de uma string, mas um aro de objeto não pode ser injetado:
 * por isso todo texto passa por `textoSeguro` antes.
 */
function textoSeguro(valor, limite = 240) {
  const texto = String(valor ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return texto.length > limite ? `${texto.slice(0, limite)}…` : texto;
}

/** Troca QUALQUER ocorrência dos segredos vivos pelo marcador. */
function limparSegredos(texto, segredos) {
  let saida = texto;
  for (const segredo of segredos) {
    if (typeof segredo !== 'string' || segredo.length < 6) continue;
    saida = saida.split(segredo).join(REDIGIDO);
  }
  return saida;
}

/**
 * Remove do registro o que não pode ser registrado. Percorre o objeto (o
 * registro é raso por construção, mas a função não depende disso) e devolve uma
 * cópia: quem chamou não perde nada.
 */
export function redactValue(valor, { segredos = [], chavePai = null } = {}) {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map((item) => redactValue(item, { segredos, chavePai }));
  if (typeof valor === 'object') {
    const saida = {};
    for (const [chave, interno] of Object.entries(valor)) {
      // `error.name` é o NOME DA CLASSE do erro (utilidade máxima no log) e não
      // o nome de uma pessoa: a regra de `nome` não se aplica aqui.
      const nomeDeClasse = chavePai === 'error' && chave === 'name';
      // Defesa em profundidade: além de limpar VALORES de segredo conhecido,
      // uma chave com nome de credencial não sai em claro nem se o valor for
      // desconhecido para o processo.
      saida[chave] = nomeDeClasse
        ? valor[chave]
        : CHAVES_SENSIVEIS.test(chave)
          ? REDIGIDO
          : redactValue(interno, { segredos, chavePai: chave });
    }
    return saida;
  }
  if (typeof valor === 'string') {
    return limparSegredos(textoSeguro(valor), segredos);
  }
  return valor;
}

/**
 * Marcador de requisição: o mesmo id que sai no cabeçalho e o que a linha de log
 * carrega.
 */
export function createRequestId(id = crypto.randomUUID()) {
  return id;
}

/**
 * @param {{ write?: (linha: string) => void, now?: () => number, secrets?: string[] }} opcoes
 */
export function createLog({ write = (linha) => console.error(linha), now = () => Date.now(), secrets = [] } = {}) {
  const segredos = secrets.filter((segredo) => typeof segredo === 'string' && segredo.trim().length >= 6);

  function registrar(registro) {
    const linha = redactValue({ ts: new Date(now()).toISOString(), ...registro }, { segredos });
    write(JSON.stringify(linha));
    return linha;
  }

  return {
    /** Falha de operação: o que a operação precisa para achar a causa. */
    failure({ requestId, action, status, durationMs, error, roomId } = {}) {
      const chave = chaveSegura(roomId);
      return registrar({
        level: 'error',
        event: 'api_failure',
        request_id: createRequestId(requestId),
        action: textoSeguro(action, 80),
        status: Number.isFinite(status) ? status : 500,
        duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
        ...(chave ? { room_id: chave } : {}),
        error: {
          name: textoSeguro(error?.name || 'Error', 60),
          message: textoSeguro(error?.message || error || 'erro sem mensagem', 240),
          // A causa da falha convertida em resposta publica. A linha nao pode
          // repetir so a frase que o aluno leu — senao o log nao diz nada.
          ...(error?.cause
            ? {
              cause: {
                name: textoSeguro(error.cause?.name || 'Error', 60),
                message: textoSeguro(error.cause?.message || error.cause, 240),
              },
            }
            : {}),
        },
      });
    },
    /** Aviso operacional (sem dado de pessoa). */
    warn(event, dados = {}) {
      return registrar({ level: 'warn', event: textoSeguro(event, 60), ...dados });
    },
    registrar,
    segredos,
  };
}

/**
 * Só aceita identificador com cara de identificador. `room_id` pode vir de
 * payload: sem esta trava, um valor forjado viraria texto livre no log.
 */
function chaveSegura(valor) {
  const texto = String(valor ?? '').trim();
  return ID_SEGURO.test(texto) ? texto : null;
}
