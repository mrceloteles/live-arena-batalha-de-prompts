// Perfil de hospedagem: a decisão mora aqui, não só na documentação.
//
// O produto tem estado LOCAL AO PROCESSO por desenho: o hub de tempo real
// (`events.mjs`), o limitador de tentativas e a fila de serialização das
// escritas do estado coletivo vivem na memória de uma instância. Duas
// instâncias atrás do mesmo proxy não se enxergam — e a auditoria de prontidão
// registrou isso como premissa oculta. Em vez de deixar a premissa escondida, a
// implantação recomendada é explícita: UM processo com UM volume persistente e
// o SQLite local, que é também o backend onde a integridade referencial está
// comprovada (o arquivo local nasce com `PRAGMA foreign_keys = ON`).
//
// O caminho de banco gerenciado (Turso/libSQL) continua existindo no código,
// mas NÃO nasce pronto: a auditoria reproduziu, com o cliente libSQL real, um
// caso em que `PRAGMA foreign_keys` ligado dentro de uma transação já aberta
// não vale e uma referência órfã é aceita. Enquanto isso não é comprovado na
// base de quem vai hospedar, produção recusa esse backend — e a recusa só sai
// do lugar depois de `npm run validar-integridade` ter passado NO BANCO REAL e
// o operador ter registrado isso explicitamente no ambiente.
//
// O gate é uma trava, não uma opinião: aceitar em silêncio um backend que pode
// gravar nota para uma sala que não existe é o tipo de defeito que só aparece
// no meio da aula.

/** Perfil recomendado (e o que o `Dockerfile` já monta). */
export const PERSISTENT_VOLUME = 'volume-persistente';
/** Perfil condicionado à prova de integridade no banco do operador. */
export const MANAGED_DATABASE = 'banco-gerenciado';

/** Marca posta pelo operador DEPOIS de rodar a ferramenta no banco dele. */
export const INTEGRITY_VERIFIED_FLAG = 'TURSO_INTEGRITY_VERIFIED';
/** O comando que produz a prova. Citado na mensagem para não exigir adivinha. */
export const INTEGRITY_TOOL = 'npm run validar-integridade';

/**
 * Qual perfil esta instalação está usando. Não valida nada — só nomeia, para a
 * prontidão poder dizer de fora qual das duas implantações está no ar.
 */
export function resolveHosting(env = process.env, { remote = Boolean(env.TURSO_URL) } = {}) {
  return remote ? MANAGED_DATABASE : PERSISTENT_VOLUME;
}

/**
 * O que impede a prontidão de uma instalação — a fatia de hospedagem.
 * Devolve texto legível e SEM valores secretos (isso vai para o `/readyz`).
 */
export function hostingProblems({
  env = process.env,
  remote = Boolean(env.TURSO_URL),
  production = false,
} = {}) {
  const problems = [];
  if (remote && production && String(env[INTEGRITY_VERIFIED_FLAG] ?? '') !== '1') {
    problems.push(
      'backend de banco gerenciado (TURSO_URL) não validado neste banco: a integridade referencial '
      + `não é garantida pelo caminho remoto. Rode \`${INTEGRITY_TOOL}\` contra a base de produção e, `
      + `só depois de ele passar, defina ${INTEGRITY_VERIFIED_FLAG}=1`,
    );
  }
  return problems;
}

/**
 * Avisos que NÃO tiram a instância do ar — informação que o operador precisa
 * ver, mas que não justifica recusar a subida.
 *
 * O caso: em produção, o banco dentro do diretório da aplicação é um banco que
 * morre no próximo redeploy (a imagem é substituída inteira). Não dá para saber
 * daqui se há um volume montado por cima desse caminho, então isto é aviso: o
 * texto diz exatamente qual condição o disparou.
 */
export function hostingWarnings({
  env = process.env,
  databasePath = '',
  appRoot = '',
  remote = Boolean(env.TURSO_URL),
} = {}) {
  const warnings = [];
  if (remote) return warnings;
  const caminho = String(databasePath || '');
  const raiz = String(appRoot || '');
  if (!caminho || !raiz) return warnings;
  if (!caminho.startsWith(raiz)) return warnings;
  warnings.push(
    `banco dentro do diretório da aplicação (${caminho}): um redeploy substitui este diretório e o `
    + 'arquivo vai junto. Aponte DATABASE_PATH para o volume persistente (ex.: /data/descubra-o-prompt.sqlite) '
    + '— ou ignore este aviso se houver um volume montado exatamente nesse caminho.',
  );
  return warnings;
}
