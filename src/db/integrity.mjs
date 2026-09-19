// Integridade referencial: a pergunta é feita AO BANCO, não ao código que abre o
// banco.
//
// A auditoria de prontidão registrou que o caminho remoto (Turso/libSQL) liga
// `PRAGMA foreign_keys` DEPOIS de a transação estar aberta — e, no SQLite, esse
// pragma é no-op dentro de transação. O teste que existia só conferia a ORDEM
// das chamadas num cliente simulado: ele continuaria verde com o banco
// aceitando referência órfã. Aqui a prova é outra: criar uma referência órfã de
// verdade, no banco de verdade, e ver se ele recusa.
//
// Duas respostas separadas, porque as duas importam e falham por motivos
// diferentes:
//
//   1. `orphanRejected` — o banco RECUSA uma referência órfã nova. Se aceitar, a
//      integridade não vale: nota pode apontar para uma sala que não existe;
//   2. `violations` — `PRAGMA foreign_key_check` nos DADOS REAIS. Um banco pode
//      passar na prova de recusa e já ter lixo de antes.
//
// A sonda roda dentro de uma transação e as tabelas de prova são derrubadas
// antes do commit: quem chama o diagnóstico não ganha tabela nova, nem com o
// banco já populado.

const PROBE_PAI = '_prova_integridade_pai';
const PROBE_FILHO = '_prova_integridade_filho';

function mensagemDe(error) {
  return String(error?.message || error);
}

/**
 * @returns {{ backend: string, foreignKeys: number|null, orphanRejected: boolean,
 *   orphanError: string|null, violations: Array<object>, ok: boolean, reason: string|null }}
 */
export async function checkReferentialIntegrity(opened) {
  const backend = opened?.isRemote ? 'remoto' : 'local';
  let foreignKeys = null;
  let orphanRejected = false;
  let orphanError = null;

  await opened.database.transaction(async (db) => {
    const pragma = await db.prepare('PRAGMA foreign_keys').get();
    foreignKeys = Number(Object.values(pragma || {})[0] ?? 0);

    await db.exec(`CREATE TABLE ${PROBE_PAI} (id TEXT PRIMARY KEY) STRICT`);
    await db.exec(
      `CREATE TABLE ${PROBE_FILHO} (
         id TEXT PRIMARY KEY,
         pai_id TEXT NOT NULL REFERENCES ${PROBE_PAI}(id)
       ) STRICT`,
    );
    await db.prepare(`INSERT INTO ${PROBE_PAI} (id) VALUES (?)`).run('pai');
    // Esta é a pergunta: o banco recusa filho apontando para pai inexistente?
    try {
      await db.prepare(`INSERT INTO ${PROBE_FILHO} (id, pai_id) VALUES (?, ?)`).run('orfao', 'nao-existe');
    } catch (error) {
      orphanRejected = true;
      orphanError = mensagemDe(error);
    }
    await db.exec(`DROP TABLE ${PROBE_FILHO}`);
    await db.exec(`DROP TABLE ${PROBE_PAI}`);
  });

  const violations = await opened.database.prepare('PRAGMA foreign_key_check').all();

  const reasons = [];
  if (!orphanRejected) {
    reasons.push('o banco aceitou uma referência órfã: a integridade referencial não vale nesta conexão');
  }
  if (violations.length) {
    reasons.push(`o banco já tem ${violations.length} referência(s) órfã(s) nos dados atuais`);
  }
  return {
    backend,
    foreignKeys,
    orphanRejected,
    orphanError,
    violations,
    ok: reasons.length === 0,
    reason: reasons.length ? reasons.join('; ') : null,
  };
}

/** Texto para o operador — o mesmo veredito, em linhas, sem jargão. */
export function describeIntegrity(report, { integrityTool = 'npm run validar-integridade' } = {}) {
  const linhas = [
    `backend: ${report.backend}`,
    `PRAGMA foreign_keys nesta conexão: ${report.foreignKeys ?? 'desconhecido'}`,
    report.orphanRejected
      ? `referência órfã recusada: sim (${report.orphanError})`
      : 'referência órfã recusada: NÃO — o banco aceitou o órfão',
    `referências órfãs nos dados atuais: ${report.violations.length}`,
  ];
  if (report.ok) {
    linhas.push('veredito: integridade referencial COMPROVADA neste banco.');
  } else {
    linhas.push(`veredito: REPROVADO — ${report.reason}`);
    linhas.push(`não marque a prova antes de corrigir: ${integrityTool} tem de passar neste banco.`);
  }
  return linhas.join('\n');
}
