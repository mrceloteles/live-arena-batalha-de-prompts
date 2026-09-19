// Abrir o navegador dos testes de tela, com as marcas que o CI exige.
//
// No runner do GitHub o Chromium não consegue usar o sandbox do kernel
// (`No usable sandbox!`) e o `/dev/shm` é pequeno demais para o padrão do
// Chrome — sem `--no-sandbox` e `--disable-dev-shm-usage` o teste morre antes de
// abrir a primeira página. Localmente nenhuma das duas é necessária, e passá-las
// só esconderia um problema real de configuração da máquina: por isso elas
// entram apenas quando `CI` está no ambiente.
//
// Centralizar isto aqui também é o que mantém os três arquivos de navegador
// iguais na hora de abrir a janela: eram doze `puppeteer.launch({ headless:
// true })` copiados, e a correção de um deles não valia para os outros onze.
import puppeteer from 'puppeteer';

const marcasDoCi = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];

export function abrirNavegador(opcoes = {}) {
  // Sem marcas extras a chamada fica idêntica à de antes: `args` só entra quando
  // existe, para que o comportamento local não dependa de passar um array vazio.
  const padrao = { headless: true };
  if (marcasDoCi.length) padrao.args = marcasDoCi;
  return puppeteer.launch({ ...padrao, ...opcoes });
}

// --- A política de espera dos testes de tela -------------------------------
//
// Duas medições explicam por que ela existe.
//
// 1. O padrão do Puppeteer é 30 s por espera. Foi assim que o portão 2
//    reprovou numa máquina carregada: `Waiting for selector
//    [data-arena-dialog] [data-challenge-form] failed (30000ms exceeded)`, num
//    teste que passa sozinho em 5 s — o mesmo defeito, em teste diferente, em
//    duas de quatro execuções completas. Não era o produto, era a espera.
// 2. Mesmo orçamento grande não basta quando o clique pode se perder: os
//    painéis do professor releem o servidor a cada 2,5 s e trocam o próprio
//    DOM, então um clique pode cair num botão que acabou de ser substituído —
//    e aí a espera seguinte estoura o tempo todo, porque não há o que esperar.
//    É por isso que existe `clicarAte`, e não só um `timeout` maior.
export const ESPERA = {
  // Consequência imediata de uma ação: abrir um diálogo, aplicar um campo.
  curta: 15_000,
  // Uma tela ou um trecho de estado do servidor chegar à página.
  padrao: 60_000,
  // Tetos dos testes (`test(... , { timeout })`): são o freio de mão para um
  // travamento de verdade, não a duração esperada. Medido: o teste do Modo
  // Arena leva 58 s ocioso, 57 s com metade da máquina ocupada e mais de 240 s
  // com os oito núcleos saturados — era esse teto antigo que reprovava, antes
  // de qualquer espera individual estourar. Os outros testes da arena não
  // passam de 40 s em nenhuma das três medições.
  teste: 180_000,
  testeLongo: 480_000,
};

// `raf` (padrão do Puppeteer) espera o próximo quadro; com várias páginas
// abertas no mesmo navegador, só a que está na frente desenha com
// regularidade. Um intervalo não depende de quadro nenhum.
export const POLLING = 100;

function comPolitica(pagina) {
  // Por que um invólucro, e não opções em cada chamada: são dezenas de esperas
  // em três arquivos, e esquecer uma é exatamente o defeito que está sendo
  // corrigido. Quem precisa de um limite diferente passa `timeout`/`polling`
  // explícitos — o explícito vence o padrão.
  for (const metodo of ['waitForSelector', 'waitForFunction']) {
    if (typeof pagina[metodo] !== 'function') continue;
    const original = pagina[metodo].bind(pagina);
    pagina[metodo] = (alvo, opcoes = {}, ...resto) =>
      original(alvo, { polling: POLLING, timeout: ESPERA.padrao, ...opcoes }, ...resto);
  }
  pagina.setDefaultTimeout(ESPERA.padrao);
  pagina.setDefaultNavigationTimeout(ESPERA.padrao);
  return pagina;
}

// `context` isola uma superficie dos COOKIES das outras. É o navegador de
// verdade: o aluno não tem o cookie do painel do professor na máquina dele. Sem
// um contexto próprio, uma segunda página do mesmo navegador de teste herda a
// sessão do professor — e a conexão dela acaba autorizada pelo cookie errado,
// deixando de exercitar a credencial que o teste quer medir.
export async function abrirPagina(navegador, { viewport, cookie, context } = {}) {
  const pagina = comPolitica(await (context ? context.newPage() : navegador.newPage()));
  if (viewport) await pagina.setViewport(viewport);
  if (cookie) await pagina.setCookie(cookie);
  return pagina;
}

// `networkidle2` — o que os testes da arena usavam para recarregar — exige
// 500 ms sem requisição em voo. O cliente mantém o SSE aberto e consulta o
// servidor a cada 2,5 s, então essa janela pode simplesmente não chegar sob
// carga: é um critério sobre a rede, não sobre o app. O sinal de prontidão do
// app é o marcador que o teste espera logo depois, e `domcontentloaded` já
// garante que o script da página rodou.
export const carregar = (pagina, url, opcoes = {}) =>
  pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: ESPERA.padrao, ...opcoes });

export const recarregar = (pagina, opcoes = {}) =>
  pagina.reload({ waitUntil: 'domcontentloaded', timeout: ESPERA.padrao, ...opcoes });

// Espera longa demais é sintoma, não só demora: o relato abaixo é o que
// diferencia "a máquina estava disputada" de "a tela nunca chegou".
function relatar(descricao, ms, timeout) {
  if (ms < 2_000) return;
  const teto = Math.round(timeout / 1000);
  console.log(`[espera] ${(ms / 1000).toFixed(1)}s (teto ${teto}s) — ${descricao}`);
}

export async function esperarPor(pagina, condicao, {
  descricao = 'a condição', timeout = ESPERA.padrao, polling = POLLING, args,
} = {}) {
  if (typeof condicao !== 'function') {
    throw new TypeError(`esperarPor precisa de uma condição (função), não ${typeof condicao}`);
  }
  const inicio = Date.now();
  try {
    await pagina.waitForFunction(condicao, { polling, timeout }, ...(args === undefined ? [] : [args]));
  } catch (erro) {
    throw new Error(
      `espera falhou depois de ${Date.now() - inicio}ms: ${descricao} — ${pagina.url()} — ${erro.message}`,
      { cause: erro },
    );
  }
  relatar(descricao, Date.now() - inicio, timeout);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Clica e só considera o clique feito quando a consequência esperada aparece.
//
// Um `page.click` normal resolve quando o evento sai, não quando ele faz
// efeito; se o painel se redesenhou entre a consulta do elemento e o clique, o
// evento cai no vazio e a espera seguinte estoura por inteiro. Aqui o clique
// acontece dentro da página (consulta e clique no mesmo passo síncrono, sem
// espaço para o DOM ser trocado no meio) e é repetido enquanto a consequência
// não chega — o que também cobre o botão que ainda não foi desenhado.
//
// A consequência é conferida por `evaluate`, e não por `waitForFunction`: o
// `waitForFunction` do Puppeteer engole o erro de uma condição com defeito e o
// entrega como "Waiting failed: <tempo> exceeded" — o bug de quem escreveu o
// teste vira um tempo esgotado. Por `evaluate` o erro sobe com o texto dele.
export async function clicarAte(pagina, seletor, condicao, {
  descricao = `o clique em ${seletor} fazer efeito`,
  timeout = ESPERA.padrao, polling = POLLING, args, janela = 5_000,
} = {}) {
  // Esquecer a condição é um erro de quem escreve o teste, e o `evaluate` sem
  // função reclamaria com "Cannot convert undefined or null to object" — que não
  // diz nada a respeito de um clique que nunca vai ter efeito nenhum.
  if (typeof condicao !== 'function') {
    throw new TypeError(`clicarAte precisa de uma condição (função) para ${seletor}, não ${typeof condicao}`);
  }
  const prazo = Date.now() + timeout;
  const pacote = args === undefined ? [] : [args];
  const inicio = Date.now();
  let cliques = 0;
  while (Date.now() < prazo) {
    const alcancou = await pagina.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return false;
      node.scrollIntoView({ block: 'center' });
      node.click();
      return true;
    }, seletor);
    if (!alcancou) {
      // O botão ainda não foi desenhado (o painel está carregando): tenta de
      // novo até o prazo, sem devolver um erro que fala de outra coisa.
      await dormir(polling);
      continue;
    }
    cliques += 1;
    const fimDaJanela = Math.min(Date.now() + janela, prazo);
    let pronto = false;
    while (!pronto && Date.now() < fimDaJanela) {
      pronto = await pagina.evaluate(condicao, ...pacote);
      if (!pronto) await dormir(polling);
    }
    if (pronto) {
      relatar(`${descricao} (${cliques} clique(s))`, Date.now() - inicio, timeout);
      return;
    }
  }
  throw new Error(
    `o clique não teve efeito: ${descricao} — ${pagina.url()} — ${cliques} clique(s) em ${timeout}ms`,
  );
}
