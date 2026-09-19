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
    const roomRounds = await repositories.arena.rounds.listByRoom(room.id);
    const people = await repositories.arena.participants.listByRoom(room.id);
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
      game: { id: `arena:${room.id}`, cycle: room.pin || room.code, phase: room.status, created_at: room.createdAt },
      report, rounds, mode: room.preset === 'turma' ? 'classroom' : room.preset === 'classic' ? 'classic' : 'arena',
    };
  }
}
