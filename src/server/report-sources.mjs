// Normalize both persisted engines into the existing report contract.
export async function* reportSources(repositories) {
  for (const game of await repositories.rooms.list()) {
    const report = await repositories.reports.forGame(game.id);
    if (!report) continue;
    yield {
      game, report,
      mode: (await repositories.settings.get(`classroom:${game.id}`))?.mode || 'classic',
      rounds: (await repositories.rooms.getState(game.id))?.rounds || [],
    };
  }
  for (const room of await repositories.arena.rooms.list()) {
    const people = await repositories.arena.participants.listByRoom(room.id);
    // A sala pode ter sido JOGADA MAIS DE UMA VEZ ("Nova batalha nesta sala"):
    // cada ciclo vira uma entrada própria, com identidade e rótulo próprios. Sem
    // isso as duas "Rodada 1" se fundiriam na mesma linha do relatório (a chave
    // de `roundTotals` é `game.id:rodada`) e o professor não teria como dizer o
    // que foi de cada aula. A batalha 1 mantém o id e o rótulo que já existiam.
    const batalhas = await repositories.arena.rounds.cycles(room.id);
    const lista = batalhas.length ? batalhas : [{ cycle: 1, rounds: 0, started: 0, createdAt: room.createdAt, lastAt: null }];
    for (const batalha of lista) {
      const campoSala = room.pin || room.code;
      const roomRounds = await repositories.arena.rounds.listByRoomCycle(room.id, batalha.cycle);
      const report = { sessions: [], matches: [], submissions: [], scores: [], judgeAttempts: [] };
      const rounds = [];
      report.sessions = people.map((person, index) => ({
        ...person, id: `arena:${person.id}`, stationId: person.stationNumber || index + 1,
        playerName: person.name, registeredAt: person.joinedAt,
      }));
      for (const round of roomRounds) {
        const challenge = await repositories.arena.challenges.getById(round.challengeId);
        const submissions = await repositories.arena.submissions.listByRound(round.id);
        const scores = await repositories.arena.scores.listByRound(round.id);
        const byId = new Map(submissions.map((submission) => [submission.id, submission]));
        rounds.push({ number: round.position, referencePrompt: challenge?.referencePrompt || challenge?.referenceText || '', imagePath: challenge?.referenceImage || '' });
        report.matches.push({ id: round.id, roundNumber: round.position, startedAt: round.startedAt });
        report.submissions.push(...submissions.map((submission) => ({
          id: submission.id, session_id: `arena:${submission.participantId}`, match_id: round.id,
          prompt: submission.prompt, submitted_at: submission.submittedAt, attempt: submission.attempt,
        })));
        report.scores.push(...scores.map((score) => ({
          submission_id: score.submissionId, percent: score.percent, points: score.points ?? score.percent,
          elapsed_seconds: Math.max(0, Number(byId.get(score.submissionId)?.submittedAt) - Number(round.startedAt)),
          created_at: score.createdAt,
        })));
        report.judgeAttempts.push(...scores.map((score) => ({ submission_id: score.submissionId, model: score.model })));
      }
      yield {
        game: {
          id: batalha.cycle === 1 ? `arena:${room.id}` : `arena:${room.id}:${batalha.cycle}`,
          cycle: batalha.cycle === 1 ? campoSala : `${campoSala} #${batalha.cycle}`,
          phase: room.status,
          created_at: room.createdAt,
        },
        report, rounds, mode: room.preset === 'turma' ? 'classroom' : room.preset === 'classic' ? 'classic' : 'arena',
      };
    }
  }
}
