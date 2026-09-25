// Protótipo: para cada par hoje fora da aritmética por fundo translúcido ou
// transparente, procurar quem pinta as camadas de trás e compor.
import { readFileSync } from 'node:fs';

import { FOLHAS, analisarRegras } from '../../test/support/cascata-css.mjs';
import { compor, contraste, fundosDeclarados, interpretarCor, tokensDe } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const folhas = FOLHAS.map((f) => ({ ...f, texto: readFileSync(new URL(`public/assets/css/${f.nome}`, RAIZ), 'utf8') }));
const tokens = tokensDe(folhas);

const propsDe = (regra) => {
  const m = new Map();
  for (const d of regra.decls) {
    const c = d.indexOf(':');
    if (c > 0) m.set(d.slice(0, c).trim().toLowerCase(), d.slice(c + 1).trim());
  }
  return m;
};

/** Cadeia de compostos: divide em espaço / > / + / ~ no nível de topo. */
function cadeia(seletor) {
  const partes = [];
  let atual = '';
  let prof = 0;
  let colchete = 0;
  let irmao = false;
  for (let i = 0; i < seletor.length; i += 1) {
    const c = seletor[i];
    if (c === '(') prof += 1;
    if (c === ')') prof -= 1;
    if (c === '[') colchete += 1;
    if (c === ']') colchete -= 1;
    if (prof === 0 && colchete === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) {
      if (c === '+' || c === '~') irmao = true;
      if (atual.trim()) partes.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return { compostos: partes, irmao };
}

const semPseudo = (composto) => composto.replace(/::?[a-z-]+(\([^)]*\))?/gi, '') || composto;
const ehGlobal = (composto) => /^(html|body|:root|\*)/.test(composto);

/** O composto do provedor pode ser o MESMO elemento que um composto da cadeia? */
const mesmoComposto = (a, b) => {
  const na = semPseudo(a);
  const nb = semPseudo(b);
  return na === nb;
};

// Todos os provedores de fundo (qualquer regra que declare fundo), com a camada resolvida.
const provedores = [];
for (const folha of folhas) {
  for (const regra of analisarRegras(folha.texto)) {
    const props = propsDe(regra);
    if (![...props.keys()].some((p) => /^(background|background-color)$/.test(p))) continue;
    const info = fundosDeclarados(props, tokens);
    const c = cadeia(regra.key.split('||')[1] || regra.key);
    provedores.push({
      folha: folha.nome,
      chave: regra.key,
      seletor: regra.key.split('||')[1],
      compostos: c.compostos,
      irmao: c.irmao,
      info,
      linha: folha.texto.slice(0, regra.posicao).split('\n').length,
    });
  }
}

const CAMINHO_DO_GLOBAL = (compostoAlvo) => ehGlobal(compostoAlvo);

/** Contextos ancestrais PROVADOS: os compostos do provedor aparecem, em ordem,
 *  na cadeia da regra, sempre antes do último (o próprio elemento). */
function contextosProvados(cadeiaAlvo) {
  const n = cadeiaAlvo.length;
  const achados = [];
  for (const p of provedores) {
    if (p.irmao) continue;
    let i = 0;
    let alvo = 0;
    let ok = true;
    const posicoes = [];
    for (const composto of p.compostos) {
      if (ehGlobal(composto)) {
        // Composto global (body/html/:root): não precisa estar escrito na cadeia.
        posicoes.push(-1);
        continue;
      }
      let achou = -1;
      for (let j = alvo; j < n - 1; j += 1) {
        if (mesmoComposto(composto, cadeiaAlvo[j])) {
          achou = j;
          break;
        }
      }
      if (achou === -1) {
        ok = false;
        break;
      }
      posicoes.push(achou);
      alvo = achou + 1;
    }
    if (ok && posicoes.some((x) => x >= 0)) achados.push({ ...p, posicoes });
    void i;
  }
  return achados;
}

const ehTranslucido = (info) => info.motivo && info.motivo.startsWith('fundo translúcido');
const ehTransparente = (info) => info.motivo === 'fundo transparente';

console.log('provedores de fundo:', provedores.length);
const alvos = [];
for (const folha of folhas) {
  let linha = 0;
  for (const regra of analisarRegras(folha.texto)) {
    linha += 1;
    const props = propsDe(regra);
    if (!props.has('color')) continue;
    if (![...props.keys()].some((p) => /^(background|background-color)$/.test(p))) continue;
    const info = fundosDeclarados(props, tokens);
    if (!ehTranslucido(info) && !ehTransparente(info)) continue;
    alvos.push({ folha: folha.nome, chave: regra.key, props, info });
  }
}
console.log('alvos (translúcido + transparente):', alvos.length);

let provados = 0;
let semContexto = 0;
for (const alvo of alvos) {
  const seletor = alvo.chave.split('||')[1] || alvo.chave;
  const c = cadeia(seletor).compostos;
  const ctx = contextosProvados(c);
  if (ctx.length) provados += 1;
  else semContexto += 1;
  if (ctx.length) {
    const nomes = [...new Set(ctx.map((x) => x.seletor))];
    console.log(`\n${alvo.folha} ${seletor}`);
    console.log(`   camadas provadas (${ctx.length}): ${nomes.slice(0, 4).join(' || ')}`);
    const exemplo = ctx[0];
    console.log(`   ex. camada: ${JSON.stringify(exemplo.info.fundos ?? exemplo.info.motivo)}`);
  } else {
    console.log(`\n!! SEM CONTEXTO PROVADO: ${alvo.folha} ${seletor}`);
  }
}
console.log('\nresumo: provados', provados, '| sem contexto', semContexto);
void compor;
void contraste;
void interpretarCor;
void CAMINHO_DO_GLOBAL;
