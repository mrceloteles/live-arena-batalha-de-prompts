const rootsOfensivas = [
  'arromb', 'babaca', 'bastard', 'bicha', 'bitch', 'bix', 'bucet', 'caralh', 'cocaina', 'cuz', 'foda', 'fud',
  'fuck', 'hitler', 'maconha', 'machist', 'merd', 'nazist', 'pedofil', 'piran', 'porna', 'porno',
  'porra', 'putaria', 'puta', 'puto', 'racist', 'retard', 'shit', 'traficante', 'estupr', 'vagabund', 'viad',
];
const siglasOfensivas = new Set(['fdp', 'pqp', 'vsf', 'vtnc']);

function palavraNormalizada(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[@4]/g, 'a')
    .replace(/[013]/g, (digit) => ({ '0': 'o', '1': 'i', '3': 'e' })[digit])
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]+/g, '');
}

export function isOffensiveParticipantName(name) {
  const tokens = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').split(/[^a-z0-9@!$]+/).filter(Boolean)
    .map(palavraNormalizada);
  const joined = palavraNormalizada(name);
  return tokens.some((token) => siglasOfensivas.has(token)
    || rootsOfensivas.some((root) => token.length >= 4 && token.includes(root)))
    || [...siglasOfensivas].some((term) => joined.includes(term))
    || rootsOfensivas.some((root) => joined.includes(root));
}
