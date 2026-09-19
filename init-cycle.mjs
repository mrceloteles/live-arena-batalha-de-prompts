import { openDatabase } from './src/db/database.mjs';
import { createRepositories } from './src/db/repositories/index.mjs';
import { randomUUID } from 'node:crypto';
import { DEFAULT_ROUNDS } from './src/server/start.mjs';

const opened = openDatabase('./var/descubra-o-prompt.sqlite');
const repos = createRepositories(opened.database);

const timestamp = Date.now() / 1000;
let game = repos.rooms.getActive();
console.log('Active game before:', game);

if (!game) {
  game = repos.rooms.createCycle({ id: randomUUID(), now: timestamp });
  repos.rooms.putRounds(game.id, DEFAULT_ROUNDS, timestamp);
}

console.log('Active game after:', repos.rooms.getActive());
const state = repos.rooms.getState(game.id);
console.log('Room phase:', state.phase);
console.log('Stations available:', state.stations);
