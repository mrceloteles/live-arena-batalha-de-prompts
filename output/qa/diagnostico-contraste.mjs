// Diagnóstico do instrumento de contraste: o retângulo que eu medi corresponde
// ao pixel que eu medi?
//
//   node output/qa/diagnostico-contraste.mjs tmp/qa/contraste-antes
//
// Se o print tiver escala, rolagem ou quadro diferente do que o DOM informou,
// toda razão sai errada — e o pior desfecho seria publicar um "reprovado" que é
// defeito da régua. Aqui, para cada tela: dimensões do PNG, cor dominante da
// imagem inteira e um PERFIL VERTICAL (cor dominante de cada faixa de 10% da
// altura). É o perfil que diz qual dos dois está torto:
//
// - perfil todo branco numa tela escura → o print não é o que eu penso;
// - perfil escuro com faixas claras onde o DOM diz que há cartão claro → o
//   print está certo e o que eu preciso conferir é o mapeamento do retângulo.
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
  if (!ihdr || ihdr.bits !== 8 || ihdr.interlace !== 0) throw new Error('PNG inesperado');
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

const modoDaFaixa = (imagem, x0, x1, y0, y1) => {
  const contagem = new Map();
  for (let y = Math.max(0, y0); y < Math.min(imagem.altura, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(imagem.largura, x1); x += 1) {
      const i = y * imagem.linhaBytes + x * imagem.bpp;
      const chave = (imagem.pixels[i] << 16) | (imagem.pixels[i + 1] << 8) | imagem.pixels[i + 2];
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
  }
  const total = [...contagem.values()].reduce((soma, v) => soma + v, 0) || 1;
  const [chave, quantidade] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  return `#${chave.toString(16).padStart(6, '0')} ${(100 * quantidade / total).toFixed(0)}%`;
};

const pasta = process.argv[2] || 'tmp/qa/contraste-antes';
const { medidas } = JSON.parse(readFileSync(`${pasta}/contraste.json`, 'utf8'));
for (const tela of [...new Set(medidas.map((m) => m.tela))]) {
  let imagem;
  try {
    imagem = decodificarPng(readFileSync(`${pasta}/${tela}.png`));
  } catch (erro) {
    console.log(`${tela}: sem print (${erro.message})`);
    continue;
  }
  const faixas = [];
  for (let i = 0; i < 10; i += 1) {
    const y0 = Math.floor((imagem.altura * i) / 10);
    const y1 = Math.floor((imagem.altura * (i + 1)) / 10);
    faixas.push(modoDaFaixa(imagem, 0, imagem.largura, y0, y1));
  }
  console.log(`${tela.padEnd(24)} print ${imagem.largura}×${imagem.altura} | faixas: ${faixas.join(' | ')}`);
}
