import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFallbackPercent } from '../../src/judge/fake-judge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OBSERVATIONS = path.join(here, 'observations.json');
const DEFAULT_CANDIDATES = path.join(here, 'candidates');

export function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

export function rank(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i + 1;
    while (j < indexed.length && indexed[j].value === indexed[i].value) j += 1;
    const avgRank = ((i + 1) + j) / 2;
    for (let k = i; k < j; k += 1) ranks[indexed[k].index] = avgRank;
    i = j;
  }
  return ranks;
}

export function pearson(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = a.reduce((s, x) => s + x, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return null;
  return num / Math.sqrt(denA * denB);
}

export function spearman(a, b) {
  return pearson(rank(a), rank(b));
}

function sign(value, neutral = 1) {
  if (Math.abs(value) <= neutral) return 0;
  return value > 0 ? 1 : -1;
}

function observedRows(document) {
  return (document.probes || []).map((probe) => ({
    id: probe.id,
    family: probe.family || 'unknown',
    candidatePrompt: String(probe.candidate_prompt ?? ''),
    observed: median((probe.runs || []).map(Number)),
    split: probe.split || 'dev',
  })).filter((row) => Number.isFinite(row.observed));
}

function builtInFallback(document, rows) {
  const reference = String(document.reference_prompt_hypothesis || '').trim();
  if (!reference) return null;
  return {
    id: 'source-fallback-v1',
    provenance: 'built-in recovered package fallback; reference prompt is a hypothesis supplied by dataset',
    predictions: Object.fromEntries(rows.map((row) => [row.id, sourceFallbackPercent(reference, row.candidatePrompt)])),
  };
}

function loadCandidateFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      if (!parsed.id || !parsed.predictions || typeof parsed.predictions !== 'object') {
        throw new Error(`${name}: esperado { id, predictions: { PROBE_ID: percent } }`);
      }
      return parsed;
    });
}

export function scoreCandidate(candidate, rows, { neutralDelta = 1 } = {}) {
  const usable = rows.filter((row) => Number.isFinite(Number(candidate.predictions?.[row.id])));
  if (usable.length < 2) {
    return { id: candidate.id, usable: usable.length, status: 'INSUFFICIENT' };
  }

  const observed = usable.map((row) => row.observed);
  const predicted = usable.map((row) => Number(candidate.predictions[row.id]));
  const absErrors = observed.map((value, index) => Math.abs(value - predicted[index]));
  const mae = absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length;
  const medianAe = median(absErrors);
  const rho = spearman(observed, predicted);

  const baseline = usable.find((row) => row.id === 'P01_BASELINE');
  let metamorphicAgreement = null;
  if (baseline) {
    const baseObserved = baseline.observed;
    const basePredicted = Number(candidate.predictions[baseline.id]);
    const transformed = usable.filter((row) => row.id !== baseline.id);
    if (transformed.length) {
      const correct = transformed.filter((row) => (
        sign(row.observed - baseObserved, neutralDelta)
        === sign(Number(candidate.predictions[row.id]) - basePredicted, neutralDelta)
      )).length;
      metamorphicAgreement = correct / transformed.length;
    }
  }

  const gate = {
    mae: mae <= 3,
    spearman: rho !== null && rho >= 0.95,
    medianAe: medianAe <= 2,
    metamorphic: metamorphicAgreement === null || metamorphicAgreement >= 0.85,
  };

  return {
    id: candidate.id,
    usable: usable.length,
    mae,
    medianAe,
    spearman: rho,
    metamorphicAgreement,
    gate,
    status: Object.values(gate).every(Boolean) ? 'PASS' : 'FAIL',
    provenance: candidate.provenance || null,
  };
}

function scoreSplit(candidate, rows, split) {
  const subset = rows.filter((row) => row.split === split);
  return subset.length >= 2 ? scoreCandidate(candidate, subset) : null;
}

export function tournament(document, candidates) {
  const rows = observedRows(document);
  if (rows.length < 2) throw new Error('Poucas observações: registre pelo menos duas sondas com runs numéricos.');

  const builtIn = builtInFallback(document, rows);
  const all = builtIn ? [builtIn, ...candidates] : [...candidates];
  if (!all.length) throw new Error('Nenhum candidato. Adicione candidates/*.json ou reference_prompt_hypothesis.');

  const scored = all.map((candidate) => ({
    overall: scoreCandidate(candidate, rows),
    dev: scoreSplit(candidate, rows, 'dev'),
    holdout: scoreSplit(candidate, rows, 'holdout'),
  })).sort((a, b) => {
    const aScore = a.holdout?.mae ?? a.overall.mae ?? Infinity;
    const bScore = b.holdout?.mae ?? b.overall.mae ?? Infinity;
    return aScore - bScore;
  });

  return { rows: rows.length, candidates: scored };
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function printResult(result) {
  console.log(`Observações utilizáveis: ${result.rows}\n`);
  console.table(result.candidates.map(({ overall, holdout }) => {
    const primary = holdout || overall;
    return {
      candidate: overall.id,
      split: holdout ? 'holdout' : 'overall',
      n: primary.usable,
      MAE: fmt(primary.mae),
      medianAE: fmt(primary.medianAe),
      Spearman: fmt(primary.spearman),
      metamorphic: primary.metamorphicAgreement == null ? '-' : `${(primary.metamorphicAgreement * 100).toFixed(1)}%`,
      gate: primary.status,
    };
  }));

  const winner = result.candidates[0];
  if (winner) {
    const primary = winner.holdout || winner.overall;
    console.log(`\nLíder atual: ${winner.overall.id} — ${primary.status}.`);
    if (primary.status !== 'PASS') console.log('Nenhum candidato atingiu o gate de equivalência operacional.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const observationsPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OBSERVATIONS;
  const candidatesPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_CANDIDATES;
  if (!fs.existsSync(observationsPath)) {
    throw new Error(`Dataset não encontrado: ${observationsPath}`);
  }
  const document = JSON.parse(fs.readFileSync(observationsPath, 'utf8'));
  printResult(tournament(document, loadCandidateFiles(candidatesPath)));
}
