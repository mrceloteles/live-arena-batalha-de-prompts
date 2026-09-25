// VERIFICAÇÃO PONTUAL — as linhas do ranking da TV.
//
//   node output/qa/verifica-linhas-tv.mjs tmp/qa/contraste-antes
//
// Duas suspeitas ficaram sem veredito no relatório de contraste, as duas na
// lista do ranking, e as duas pelo mesmo motivo: a régua olhou para fora da
// letra. A medalha (imagem dentro da linha) e o brilho dourado do box-shadow
// entraram na conta do fundo.
//
// Aqui a conta é feita só no pedaço de linha onde está o TEXTO do jogador — a
// faixa à direita da medalha — e o fundo é a cor dominante dessa faixa. Se a
// lista passa aqui, o que reprovou antes era a régua, não a tela.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodificarPng(buffer) {
  let offset = 8;
  let ihdr = null;
  const dados = [];
  while (offset + 8 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(offset);
    const tipo = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const conteudo = buffer.subarray(offset + 8, offset + 8 + tamanho);
    if (tipo === 'IHDR') {
      ihdr = {
        largura: conteudo.readUInt32BE(0), altura: conteudo.readUInt32BE(4),
        bits: conteudo[8], cor: conteudo[9], interlace: conteudo[12],
      };
    } else if (tipo === 'IDAT') dados.push(conteudo);
    else if (tipo === 'IEND') break;
    offset += 12 + tamanho;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.cor];
  const linhaBytes = ihdr.largura * bpp;
  const bruto = inflateSync(Buffer.concat(dados));
  const pixels = Buffer.alloc(ihdr.altura * linhaBytes);
  let pos = 0;
  for (let y = 0; y < ihdr.altura; y += 1) {
    const filtro = bruto[pos];
    pos += 1;
    const linha = bruto.subarray(pos, pos + linhaBytes);
    pos += linhaBytes;
    const anterior = y ? pixels.subarray((y - 1) * linhaBytes, y * linhaBytes) : null;
    const destino = pixels.subarray(y * linhaBytes, (y + 1) * linhaBytes);
    for (let x = 0; x < linhaBytes; x += 1) {
      const a = x >= bpp ? destino[x - bpp] : 0;
      const b = anterior ? anterior[x] : 0;
      const c = anterior && x >= bpp ? anterior[x - bpp] : 0;
      const v = linha[x];
      let valor;
      if (filtro === 0) valor = v;
      else if (filtro === 1) valor = v + a;
      else if (filtro === 2) valor = v + b;
      else if (filtro === 3) valor = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        valor = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      destino[x] = valor & 0xff;
    }
  }
  return { ...ihdr, bpp, linhaBytes, pixels };
}

const luminancia = ([r, g, b]) => {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
const razao = (a, b) => {
  const la = luminancia(a); const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Cores de um retângulo, com a frequência — o suficiente para achar o fundo. */
function coresDe(imagem, caixa) {
  const contagem = new Map();
  for (let y = Math.max(0, Math.floor(caixa.y)); y < Math.min(imagem.altura, Math.ceil(caixa.y + caixa.h)); y += 1) {
    for (let x = Math.max(0, Math.floor(caixa.x)); x < Math.min(imagem.largura, Math.ceil(caixa.x + caixa.w)); x += 1) {
      const i = y * imagem.linhaBytes + x * imagem.bpp;
      const chave = (imagem.pixels[i] << 16) | (imagem.pixels[i + 1] << 8) | imagem.pixels[i + 2];
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
  }
  const total = [...contagem.values()].reduce((s, v) => s + v, 0) || 1;
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([chave, quantidade]) => ({
      rgb: [(chave >> 16) & 0xff, (chave >> 8) & 0xff, chave & 0xff],
      fracao: quantidade / total,
    }));
}

const pasta = process.argv[2] || 'tmp/qa/contraste-antes';
const { medidas } = JSON.parse(readFileSync(`${pasta}/contraste.json`, 'utf8'));
const alvos = medidas.filter((m) => m.tela.startsWith('tv-') && m.seletor.startsWith('li.arena-tv-rank'));

for (const alvo of alvos) {
  const imagem = decodificarPng(readFileSync(`${pasta}/${alvo.tela}.png`));
  // A faixa do texto: começa depois da medalha (25% da largura) e vai até o fim
  // da linha, sem a borda (2px de cada lado, que trazem a cor do brilho).
  const faixa = {
    x: alvo.caixa.x + alvo.caixa.w * 0.25,
    y: alvo.caixa.y + 2,
    w: alvo.caixa.w * 0.7,
    h: alvo.caixa.h - 4,
  };
  const cores = coresDe(imagem, faixa);
  const fundo = cores[0];
  const maisClara = cores.reduce((melhor, cor) => (luminancia(cor.rgb) > luminancia(melhor.rgb) ? cor : melhor), cores[0]);
  const branco = [255, 255, 255];
  const cinza = [203, 213, 225];
  console.log(`\n${alvo.tela} · ${alvo.seletor} · "${alvo.texto}"`);
  console.log(`  faixa do texto (x ${Math.round(faixa.x)}–${Math.round(faixa.x + faixa.w)} de ${Math.round(alvo.caixa.w)}px de linha)`);
  console.log(`  cores: ${cores.map((c) => `rgb(${c.rgb.join(',')}) ${(c.fracao * 100).toFixed(0)}%`).join(' | ')}`);
  console.log(`  fundo dominante rgb(${fundo.rgb.join(',')}) (${(fundo.fracao * 100).toFixed(0)}%)`
    + ` → branco ${razao(branco, fundo.rgb).toFixed(2)} : 1 · cinza #cbd5e1 ${razao(cinza, fundo.rgb).toFixed(2)} : 1`);
  console.log(`  pedaço mais claro da faixa rgb(${maisClara.rgb.join(',')}) (${(maisClara.fracao * 100).toFixed(0)}%)`
    + ` → branco ${razao(branco, maisClara.rgb).toFixed(2)} : 1 · cinza #cbd5e1 ${razao(cinza, maisClara.rgb).toFixed(2)} : 1`);
}
