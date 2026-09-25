// PERFIL HORIZONTAL DE UM ELEMENTO — onde a letra cai, e sobre o que.
//
//   node output/qa/verifica-perfil.mjs tmp/qa/contraste-antes aluno-missao "Enviar prompt"
//
// A régua do relatório devolve UM fundo por elemento. Num botão com degradê isso
// não basta: o texto à esquerda pode estar sobre o azul e o texto à direita sobre
// o pedaço claro. Aqui o retângulo é cortado em fatias verticais e cada fatia diz
// a cor dominante e o contraste do texto declarado contra ela.
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
const lerCor = (texto) => {
  const m = /rgba?\(([^)]+)\)/.exec(texto || '');
  if (!m) return null;
  const partes = m[1].split(',').map((v) => parseFloat(v));
  return partes.slice(0, 3).map((v) => Math.round(v));
};

const [pasta, tela, alvo] = process.argv.slice(2);
const { medidas } = JSON.parse(readFileSync(`${pasta}/contraste.json`, 'utf8'));
const linhas = medidas.filter((l) => l.tela === tela && l.texto.includes(alvo));
const imagem = decodificarPng(readFileSync(`${pasta}/${tela}.png`));

for (const linha of linhas) {
  const cor = lerCor(linha.corDeclarada);
  console.log(`\n"${linha.texto}" · ${linha.seletor} · declarada ${linha.corDeclarada} · caixa ${JSON.stringify(linha.caixa)}`);
  const fatias = 10;
  for (let i = 0; i < fatias; i += 1) {
    const x0 = Math.floor(linha.caixa.x + (linha.caixa.w * i) / fatias);
    const x1 = Math.floor(linha.caixa.x + (linha.caixa.w * (i + 1)) / fatias);
    const contagem = new Map();
    for (let y = linha.caixa.y; y < linha.caixa.y + linha.caixa.h; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = y * imagem.linhaBytes + x * imagem.bpp;
        const chave = (imagem.pixels[idx] << 16) | (imagem.pixels[idx + 1] << 8) | imagem.pixels[idx + 2];
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
      }
    }
    const total = [...contagem.values()].reduce((s, v) => s + v, 0) || 1;
    const maisClaro = [...contagem.keys()]
      .map((chave) => [(chave >> 16) & 0xff, (chave >> 8) & 0xff, chave & 0xff])
      .filter((rgb) => razao(rgb, cor) < 12)
      .sort((a, b) => luminancia(b) - luminancia(a))[0];
    const [chave] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
    const dominante = [(chave >> 16) & 0xff, (chave >> 8) & 0xff, chave & 0xff];
    const fracao = (contagem.get(chave) / total * 100).toFixed(0);
    console.log(`  x ${String(Math.round(x0)).padStart(5)}–${String(Math.round(x1)).padStart(5)}`
      + ` · dominante rgb(${dominante.join(',')}) ${fracao}% → texto ${razao(cor, dominante).toFixed(2)}:1`
      + ` · mais claro da fatia rgb(${(maisClaro || dominante).join(',')}) → texto ${razao(cor, maisClaro || dominante).toFixed(2)}:1`);
  }
}
