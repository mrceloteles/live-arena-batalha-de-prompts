// RECORTES DO CONTRASTE — a prova visual de cada número.
//
//   node output/qa/recortes-contraste.mjs tmp/qa/contraste-antes
//
// Medir pixel tem um risco que número nenhum denuncia: a caixa pode estar no
// lugar errado, ou o "fundo" medido pode ser o brilho do próprio elemento, ou a
// medalha dentro da linha. Por isso o veredito não termina no relatório: aqui
// cada linha reprovada (ou de fundo não-uniforme) vira um recorte do print, com
// o retângulo medido desenhado por cima, e tudo vai para uma folha HTML que se
// olha com os próprios olhos.
//
// O PNG é escrito à mão (zlib + CRC) porque o projeto não tem codificador de
// imagem — e não vale instalar um só para isto.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

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

const CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = tabela[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function bloco(tipo, conteudo) {
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt32BE(conteudo.length, 0);
  cabecalho.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([Buffer.from(tipo, 'ascii'), conteudo])), 0);
  return Buffer.concat([cabecalho, conteudo, crc]);
}

/** Escreve um PNG RGB 8 bits a partir de uma matriz de pixels {r,g,b}. */
function codificarPng(largura, altura, cor) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const linhas = Buffer.alloc(altura * (1 + largura * 3));
  for (let y = 0; y < altura; y += 1) {
    linhas[y * (1 + largura * 3)] = 0;
    for (let x = 0; x < largura; x += 1) {
      const [r, g, b] = cor(x, y);
      const i = y * (1 + largura * 3) + 1 + x * 3;
      linhas[i] = r; linhas[i + 1] = g; linhas[i + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const pasta = process.argv[2] || 'tmp/qa/contraste-antes';
const escala = Number(process.env.ESCALA || 3);
const { medidas } = JSON.parse(readFileSync(`${pasta}/contraste.json`, 'utf8'));

// O que merece recorte: o reprovado e o "a decidir" que ficou abaixo do limite
// — ou seja, tudo em que o número mandaria mexer. Uma lista de duzentos recortes
// não se olha; esta se olha inteira.
const alvos = medidas
  .filter((m) => !m.suspeita)
  .filter((m) => !m.passa || (m.confiancaBaixa && m.razaoReal < m.teto))
  .sort((a, b) => a.razaoReal - b.razaoReal);

mkdirSync(`${pasta}/recortes`, { recursive: true });
const imagens = new Map();
const cartoes = [];
for (const [indice, alvo] of alvos.entries()) {
  const tela = alvo.tela;
  if (!imagens.has(tela)) {
    try {
      imagens.set(tela, decodificarPng(readFileSync(`${pasta}/${tela}.png`)));
    } catch {
      imagens.set(tela, null);
    }
  }
  const imagem = imagens.get(tela);
  if (!imagem) continue;
  const margem = Math.round(Math.min(60, Math.max(14, alvo.caixa.h)));
  const x0 = Math.max(0, alvo.caixa.x - margem);
  const y0 = Math.max(0, alvo.caixa.y - margem);
  const x1 = Math.min(imagem.largura, alvo.caixa.x + alvo.caixa.w + margem);
  const y1 = Math.min(imagem.altura, alvo.caixa.y + alvo.caixa.h + margem);
  const largura = x1 - x0;
  const altura = y1 - y0;
  if (largura < 2 || altura < 2) continue;
  const pixelDe = (x, y) => {
    const i = (y0 + y) * imagem.linhaBytes + (x0 + x) * imagem.bpp;
    return [imagem.pixels[i], imagem.pixels[i + 1], imagem.pixels[i + 2]];
  };
  // O retângulo medido é desenhado em magenta, para dar para ver se a caixa
  // corresponde ao texto — a dúvida que a régua sozinha não responde.
  const dentroDaCaixa = (x, y) => {
    const docX = x0 + x; const docY = y0 + y;
    return docX >= alvo.caixa.x && docX <= alvo.caixa.x + alvo.caixa.w
      && docY >= alvo.caixa.y && docY <= alvo.caixa.y + alvo.caixa.h;
  };
  const naBorda = (x, y) => {
    const docX = x0 + x; const docY = y0 + y;
    const bx = docX - alvo.caixa.x; const by = docY - alvo.caixa.y;
    const dentro = bx >= -1 && bx <= alvo.caixa.w + 1 && by >= -1 && by <= alvo.caixa.h + 1;
    if (!dentro) return false;
    return bx <= 0 || bx >= alvo.caixa.w || by <= 0 || by >= alvo.caixa.h;
  };
  const arquivo = `recortes/${String(indice + 1).padStart(2, '0')}-${tela}-${alvo.seletor.replace(/[^\w.-]+/g, '_').slice(0, 40)}.png`;
  writeFileSync(`${pasta}/${arquivo}`, codificarPng(largura, altura, (x, y) => {
    if (naBorda(x, y)) return [255, 0, 200];
    return pixelDe(x, y);
  }));
  cartoes.push({
    arquivo,
    // O recorte ampliado mostra o texto como o olho precisa vê-lo.
    ampliado: `recortes/${String(indice + 1).padStart(2, '0')}-${tela}-` +
      `${alvo.seletor.replace(/[^\w.-]+/g, '_').slice(0, 40)}-ampliado.png`,
    escala: Math.min(escala, Math.max(1, Math.floor(900 / largura))),
    etiqueta: `${alvo.razaoReal} (teto ${alvo.teto}) · ${tela} · ${alvo.seletor} · ${alvo.fontPx}px/${alvo.peso}`,
    detalhe: `declarada ${alvo.corDeclarada} · fundo ${alvo.fundoUsado} · pintada ${alvo.tintaPintada}`
      + `${alvo.confiancaBaixa ? ` · ${alvo.confiancaBaixa}` : ''}`,
    texto: alvo.texto,
  });
  const fator = cartoes[cartoes.length - 1].escala;
  const semBorda = (x, y) => pixelDe(Math.floor(x / fator), Math.floor(y / fator));
  writeFileSync(`${pasta}/${cartoes[cartoes.length - 1].ampliado}`, codificarPng(largura * fator, altura * fator, semBorda));
  // Também o recorte com a caixa marcada, ampliado, para julgar as duas coisas
  // de uma vez: onde a régua mediu e como o texto realmente aparece.
  writeFileSync(`${pasta}/recortes/${String(indice + 1).padStart(2, '0')}-${tela}-caixa.png`,
    codificarPng(largura * fator, altura * fator, (x, y) => {
      const origemX = Math.floor(x / fator); const origemY = Math.floor(y / fator);
      if (naBorda(origemX, origemY)) return [255, 0, 200];
      return pixelDe(origemX, origemY);
    }));
  cartoes[cartoes.length - 1].comCaixa =
    `recortes/${String(indice + 1).padStart(2, '0')}-${tela}-caixa.png`;
}

writeFileSync(`${pasta}/recortes.html`, `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Recortes do contraste — ${pasta}</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 0; padding: 16px; background: #111827; color: #e5e7eb; }
  h1 { font-size: 20px; }
  .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .cartao { background: #1f2937; border: 1px solid #374151; border-radius: 10px; padding: 10px; }
  .cartao img { max-width: 100%; display: block; border-radius: 6px; }
  .etiqueta { font-weight: 700; margin-bottom: 4px; }
  .detalhe { color: #9ca3af; font-size: 12px; margin-bottom: 8px; }
  code { color: #fbbf24; }
</style></head>
<body>
<h1>Recortes do contraste — ${pasta} (${cartoes.length} alvos; a linha magenta é o retângulo medido)</h1>
<div class="grade">
${cartoes.map((c) => `<div class="cartao">
  <div class="etiqueta">${c.etiqueta}</div>
  <div class="detalhe">${c.detalhe}</div>
  <div class="detalhe">"${c.texto}"</div>
  <img src="data:image/png;base64,${readFileSync(`${pasta}/${c.comCaixa || c.ampliado}`).toString('base64')}" alt="recorte">
</div>`).join('\n')}
</div></body></html>`);
console.log(`${cartoes.length} recortes em ${pasta}/recortes.html`);
