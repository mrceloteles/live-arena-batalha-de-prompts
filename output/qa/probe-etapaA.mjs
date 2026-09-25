// Sonda da etapa A — portal e acessos. Mesma medição antes e depois.
//
//   node output/qa/probe-etapaA.mjs antes|depois
//
// O plano pede duas coisas que só o navegador responde:
//   1. marca, título e ação cabem na primeira tela em 390×844 e 1440×900;
//   2. a moldura em volta de três elementos não pode ser maior que eles.
// Por isso a sonda mede a ÁREA DO CARTÃO contra a área do conteúdo que ele
// envolve (marca + título + botão), em vez de só tirar print.
import { mkdirSync, writeFileSync } from 'node:fs';

import { abrirNavegador, abrirPagina, carregar, esperarPor } from '../../test/support/navegador.mjs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:3000';
const fase = process.argv[2] === 'depois' ? 'depois' : 'antes';
const pasta = `tmp/qa/etapaA-${fase}`;
mkdirSync(pasta, { recursive: true });

const TELAS = [
  { nome: 'portal', url: '/', ancora: '.portal-hero', cartao: '.portal-hero', conteudo: '.portal-hero > *' },
  { nome: 'aluno', url: '/play', ancora: '.join-card', cartao: '.join-card', conteudo: '.join-head, .arena-kicker, .arena-form, .join-card > .ghost-link' },
  { nome: 'professor', url: '/admin-arena.php', ancora: '.admin-login-card', cartao: '.admin-login-card', conteudo: '.admin-login-brand, .admin-login-head, .admin-login-form, .admin-login-back' },
];

const LARGURAS = [
  { nome: 'celular', width: 390, height: 844 },
  { nome: 'desktop', width: 1440, height: 900 },
  // Janela baixa: o cartão deixou de ter `min-height:100svh` e passou a ser
  // centralizado pelo shell. Se a centralização cortar o topo, aparece aqui.
  { nome: 'celular-baixo', width: 390, height: 520 },
];

const medir = (seletorCartao, seletorConteudo) => {
  const caixa = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cartao = document.querySelector(seletorCartao);
  if (!cartao) return { erro: `sem ${seletorCartao}` };
  const estilo = getComputedStyle(cartao);
  const filhos = [...document.querySelectorAll(seletorConteudo)];
  const partes = filhos.map((el) => ({ classe: el.className || el.tagName, ...caixa(el) }));
  const topo = Math.min(...partes.map((p) => p.y));
  const base = Math.max(...partes.map((p) => p.y + p.h));
  const conteudoAltura = base - topo;
  const c = caixa(cartao);
  const titulo = cartao.querySelector('h1');
  const botao = cartao.querySelector('.figma-cta');
  return {
    cartao: c,
    // O que o plano chama de "moldura": o que sobra de altura em volta do
    // conteúdo. Razão perto de 1 = cartão do tamanho do que ele contém.
    moldura: {
      alturaConteudo: conteudoAltura,
      razaoAltura: Number((c.h / conteudoAltura).toFixed(2)),
      folgaVertical: c.h - conteudoAltura,
    },
    sombras: estilo.boxShadow === 'none' ? 0 : estilo.boxShadow.split(/,(?![^(]*\))/).length,
    raio: estilo.borderRadius,
    borda: estilo.borderTopWidth,
    titulo: titulo ? { ...caixa(titulo), tamanho: getComputedStyle(titulo).fontSize } : null,
    botao: botao ? {
      ...caixa(botao),
      texto: botao.textContent.trim(),
      quebra: botao.getBoundingClientRect().height > parseFloat(getComputedStyle(botao).minHeight) + 8,
      visivelNaPrimeiraTela: botao.getBoundingClientRect().bottom <= window.innerHeight,
    } : null,
    partes,
  };
};

const textura = () => {
  const antes = getComputedStyle(document.querySelector('.portal-shell'), '::before');
  const shell = getComputedStyle(document.querySelector('.portal-shell'));
  return {
    pontos: antes.backgroundImage.includes('radial-gradient') ? antes.backgroundImage.slice(0, 60) : 'nenhuma',
    mascara: antes.maskImage === 'none' ? 'nenhuma' : 'presente',
    fundo: shell.backgroundImage.slice(0, 80),
  };
};

const navegador = await abrirNavegador();
const resultado = {};
try {
  for (const tela of TELAS) {
    for (const largura of LARGURAS) {
      const pagina = await abrirPagina(navegador, { viewport: { width: largura.width, height: largura.height } });
      // Sem cache: a sonda mede o CSS que está em disco, não o que o navegador
      // guardou da execução anterior.
      await pagina.setCacheEnabled(false);
      await carregar(pagina, BASE + tela.url);
      await esperarPor(pagina, (sel) => !!document.querySelector(sel), { descricao: `${tela.ancora} desenhado`, args: tela.ancora });
      const medidas = await pagina.evaluate(medir, tela.cartao, tela.conteudo);
      const chave = `${tela.nome}-${largura.nome}`;
      resultado[chave] = medidas;
      if (tela.nome === 'portal') resultado[`${chave}-textura`] = await pagina.evaluate(textura);
      await pagina.screenshot({ path: `${pasta}/${chave}.png`, fullPage: false });
      await pagina.close();
    }
  }
} finally {
  await navegador.close();
}

writeFileSync(`${pasta}/medidas.json`, JSON.stringify(resultado, null, 2));

const linha = (chave) => {
  const m = resultado[chave];
  if (!m || m.erro) return `${chave}: ${m?.erro || 'sem medida'}`;
  const b = m.botao ? ` | botão ${m.botao.w}×${m.botao.h}${m.botao.quebra ? ' QUEBRA' : ''}${m.botao.visivelNaPrimeiraTela ? '' : ' FORA DA 1ª TELA'}` : '';
  const corte = m.cartao.y < 0 ? ' | TOPO CORTADO' : '';
  const t = m.titulo ? ` | título ${m.titulo.tamanho}` : '';
  return `${chave}: cartão ${m.cartao.w}×${m.cartao.h} em y=${m.cartao.y} | conteúdo ${m.moldura.alturaConteudo}px | moldura ×${m.moldura.razaoAltura} (${m.moldura.folgaVertical}px de folga) | sombras ${m.sombras} | raio ${m.raio}${t}${b}${corte}`;
};

for (const chave of Object.keys(resultado).filter((k) => !k.endsWith('-textura'))) console.log(linha(chave));
console.log('textura do portal:', JSON.stringify(resultado['portal-celular-textura']));
console.log(`prints e medidas em ${pasta}/`);
