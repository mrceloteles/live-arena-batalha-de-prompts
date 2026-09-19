// O VIGIA da fila: a avaliação que perdeu o relógio volta sem reiniciar nada.
//
// A retomada do boot resolve o caso do processo que morreu. Este aqui é o outro:
// o processo está DE PÉ e, mesmo assim, a avaliação deixou de estar na fila —
// a requisição morreu entre gravar a submissão e julgar, o pátio foi parado por
// um erro de operação, o temporizador sumiu. Hoje, sem vigia, os desfechos eram
// dois: reiniciar, ou esperar o aluno reenviar. Com ele, o próprio processo
// encontra a submissão sem nota no banco e a devolve para a fila.
//
// O teste é de servidor de verdade (`createApplication` + HTTP): ele prova o
// caminho inteiro — o `/readyz` anuncia o vigia, a varredura recolhe a
// submissão, a nota do provedor chega sozinha e a segunda perda também é
// recolhida (o vigia insiste, não é um tiro só).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { JudgeUnavailableError } from '../../src/judge/failure.mjs';
import { createEvaluationParking } from '../../src/judge/parking.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';

const SENHA = 'senha-do-teste-do-vigia';
const SEGREDO = 'segredo-do-teste-do-vigia-32-caracteres';
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('o vigia recolhe a avaliação que perdeu o relógio, sem reiniciar o processo', { timeout: 60_000 }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);

  // O provedor recusa na primeira avaliação (a do envio) e responde nas
  // seguintes: é o provedor que piscou e voltou dentro da mesma aula.
  let avaliacoes = 0;
  const parking = createEvaluationParking({ baseDelayMs: 5, maxDelayMs: 10, maxAttempts: 4 });
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => {
      avaliacoes += 1;
      if (avaliacoes === 1) {
        throw new JudgeUnavailableError(undefined, { reason: 'gemini_http_503', status: 503 });
      }
      return {
        percent: 90,
        breakdown: { objetivo: 18, contexto: 18 },
        feedback: 'Bom prompt.',
        metadata: { provider: 'gemini', model: 'modelo-de-teste' },
      };
    },
    adminPassword: SENHA,
    adminSecret: SEGREDO,
    submitWaitMs: 150,
    parking,
    // O vigia do teste olha a fila a cada 40 ms; o resfriamento é curto porque o
    // que se mede aqui é o mecanismo, não o relógio de produção.
    parkSweepMs: 40,
    parkRearmMs: 50,
    parkRearms: 3,
  });
  const servidor = createServer(handler);
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const resposta = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const corpo = await resposta.json();
      assert.equal(resposta.status, 200, `${action}: ${JSON.stringify(corpo)}`);
      return corpo;
    };
    const ler = async (caminho) => {
      const resposta = await fetch(`${base}${caminho}`);
      return { status: resposta.status, corpo: await resposta.json() };
    };

    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma do vigia', expected_players: 8 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão 1', modality: 'precisao', mission: 'Crie um cartaz para a feira de ciências.',
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
      reference_text: 'Cartaz A3 com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    const entrada = await fetch(`${base}/api.php?action=arena_join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: room.pin || room.code, name: 'Ana' }),
    });
    const aluna = await entrada.json();
    assert.equal(entrada.status, 200, JSON.stringify(aluna));
    const detalhe = (await post('arena_room_detail', { room_id: room.id })).detail;
    const rodada = detalhe.rounds.find((missao) => missao.status === 'open');
    const envio = { participant_id: aluna.participant.id, token: aluna.token, round_id: rodada.id, attempt: 1 };

    const primeiro = await post('arena_submit', {
      ...envio, prompt: 'Crie um cartaz A3 com data, local e contato para a feira de ciências.',
    });
    assert.equal(primeiro.parked, true, 'o provedor recusou e a avaliação foi estacionada');

    // A PERDA: as esperas do pátio vão embora e o processo continua de pé. É o
    // recorte do defeito — sem o vigia, ninguém mais olharia para esta submissão.
    parking.stop();
    assert.equal(parking.state().parked, 0, 'nada na fila deste processo');
    assert.equal(parking.state().resolved, 0);

    const vigia = handler.iniciarVigiaDaFila();
    assert.equal(vigia.rodando, true, 'o vigia entra em operação');

    // A varredura do vigia é a MESMA do boot. Quem diz o que a rede já recuperou
    // é o acumulado (`judge_parking_watch`): o resumo da última varredura diz o
    // que ela VIU agora — e uma submissão que já voltou para a fila aparece lá
    // como `running`, não como `resumed`.
    const prazo = Date.now() + 15_000;
    let pronto = null;
    while (Date.now() < prazo) {
      pronto = (await ler('/readyz')).corpo;
      if (Number(pronto.judge_parking_watch?.recovered || 0) >= 1) break;
      await dormir(50);
    }
    assert.ok(Number(pronto.judge_parking_watch?.recovered || 0) >= 1,
      `o vigia precisa recolher a submissão sem nota: watch=${JSON.stringify(pronto.judge_parking_watch)} ultima=${JSON.stringify(pronto.judge_parking_resume)}`);
    assert.equal(pronto.judge_parking_resume.source, 'vigia', 'a última varredura foi do vigia, não do boot');
    assert.equal(pronto.judge_parking_watch.running, true, 'e o /readyz anuncia o vigia');
    assert.equal(pronto.judge_parking_watch.interval_ms, 40);

    // A nota chega sozinha: ninguém reenviou nada e nenhum processo subiu.
    const ate = Date.now() + 15_000;
    let missao = null;
    while (Date.now() < ate) {
      missao = (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0];
      if (Number(missao.scored || 0) >= 1) break;
      await dormir(50);
    }
    assert.equal(Number(missao?.scored || 0), 1, 'a missão foi avaliada pelo vigia');
    assert.equal(Number(missao.ranking[0].percent), 90, 'a nota é a do provedor');
    assert.equal(missao.judge.local, 0, 'nenhuma nota do juiz local');
    assert.equal(avaliacoes, 2, 'o envio tentou uma vez e o vigia completou a avaliação');

    // O vigia INSISTE: uma segunda perda, no mesmo processo, também é recolhida.
    // Esta é a janela mais cruel do defeito — a submissão GRAVADA que nunca
    // chegou a ser julgada, porque a requisição morreu entre o INSERT e a
    // avaliação. Nenhum pátio a tem, e nada além da fila do banco sabe dela.
    const carimbo = Date.now() / 1000;
    const bruno = await repositories.arena.participants.join({
      id: 'bruno-do-vigia', roomId: room.id, name: 'Bruno', token: 'token-do-bruno', now: carimbo,
    });
    await repositories.arena.submissions.create({
      id: 'submissao-orfa-do-vigia', roomId: room.id, participantId: bruno.id,
      roundId: rodada.id, attempt: 1, submittedAt: carimbo,
      prompt: 'Cartaz A3 com data, local e contato, para a feira de ciências.',
    });
    const comOrfa = (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0];
    assert.equal(comOrfa.submitted, 2, 'a submissão órfã existe (o envio chegou a ser gravado)');
    assert.equal(comOrfa.scored, 1, 'e ninguém a avaliou: nada no processo a tinha na fila');

    const ate2 = Date.now() + 15_000;
    let segunda = null;
    while (Date.now() < ate2) {
      segunda = (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0];
      if (Number(segunda.scored || 0) >= 2) break;
      await dormir(50);
    }
    assert.equal(Number(segunda?.scored || 0), 2, 'a submissão órfã também foi recolhida, sem reinício');
    const depois = (await ler('/readyz')).corpo;
    assert.ok(Number(depois.judge_parking_watch?.recovered || 0) >= 2, 'a rede de segurança já recuperou duas');
    assert.ok(Number(depois.judge_parking_watch?.sweeps || 0) >= 2, 'o vigia varreu mais de uma vez');

    // E ele para quando o encerramento pede.
    vigia.parar();
    const parado = (await ler('/readyz')).corpo;
    assert.equal(parado.judge_parking_watch, undefined, 'encerrado, o vigia sai do /readyz');
  } finally {
    servidor.closeAllConnections?.();
    await new Promise((resolve) => servidor.close(resolve));
    opened.close();
  }
});
