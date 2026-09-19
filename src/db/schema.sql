PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at REAL NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  cycle INTEGER NOT NULL UNIQUE CHECK (cycle > 0),
  phase TEXT NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0 CHECK (current_round BETWEEN 0 AND 3),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_game ON games(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS rounds (
  game_id TEXT NOT NULL REFERENCES games(id),
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 3),
  reference_prompt TEXT NOT NULL,
  rubric TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at REAL NOT NULL,
  PRIMARY KEY (game_id, number)
) STRICT;

CREATE TABLE IF NOT EXISTS stations (
  game_id TEXT NOT NULL REFERENCES games(id),
  station_id INTEGER NOT NULL CHECK (station_id BETWEEN 1 AND 50),
  label TEXT NOT NULL,
  PRIMARY KEY (game_id, station_id)
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  station_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  registered_at REAL NOT NULL,
  last_seen_at REAL NOT NULL,
  ended_at REAL,
  FOREIGN KEY (game_id, station_id) REFERENCES stations(game_id, station_id)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_station
  ON sessions(game_id, station_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 3),
  started_at REAL NOT NULL,
  deadline_at REAL NOT NULL,
  ended_at REAL,
  created_at REAL NOT NULL,
  UNIQUE (game_id, round_number)
) STRICT;

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  submitted_at REAL NOT NULL,
  UNIQUE (match_id, session_id)
) STRICT;

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  station_id INTEGER NOT NULL CHECK (station_id BETWEEN 1 AND 50),
  percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
  points INTEGER NOT NULL CHECK (points >= 0),
  elapsed_seconds REAL NOT NULL CHECK (elapsed_seconds >= 0),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 50),
  scoring_version TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at REAL NOT NULL,
  UNIQUE (submission_id, session_id)
) STRICT;

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at REAL NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS client_logs (
  id INTEGER PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  session_id TEXT REFERENCES sessions(id),
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at REAL NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS judge_attempts (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL,
  model TEXT,
  rubric_version TEXT,
  response_json TEXT,
  error TEXT,
  created_at REAL NOT NULL,
  UNIQUE (submission_id, attempt)
) STRICT;

-- ---------------------------------------------------------------------------
-- ARENA / SALAS UNIFICADAS
-- Salas (rooms) com PIN + preset, participantes por nome com station interno,
-- banco de desafios (criterios ou classico), rodadas (missoes) e submissões.
-- O motor unico usa estas tabelas; as tabelas classicas acima (games, stations,
-- sessions, matches, submissions, scores) ficam como historico somente-leitura.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arena_rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  pin TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','waiting','open','playing','ended','archived')),
  preset TEXT NOT NULL DEFAULT 'personalizado' CHECK (preset IN ('classic','turma','personalizado','arena')),
  expected_players INTEGER NOT NULL DEFAULT 0 CHECK (expected_players BETWEEN 0 AND 50),
  settings_json TEXT NOT NULL DEFAULT '{}',
  entry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (entry_blocked IN (0, 1)),
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  started_at REAL,
  ended_at REAL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_rooms_pin ON arena_rooms(pin) WHERE pin IS NOT NULL;

CREATE TABLE IF NOT EXISTS arena_participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES arena_rooms(id),
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  station_number INTEGER CHECK (station_number IS NULL OR station_number BETWEEN 1 AND 50),
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  joined_at REAL NOT NULL,
  last_seen_at REAL NOT NULL,
  UNIQUE (room_id, name)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_station_per_room
  ON arena_participants(room_id, station_number) WHERE active = 1 AND station_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  modality TEXT NOT NULL,
  mission TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  reference_text TEXT NOT NULL DEFAULT '',
  reference_image TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  speed_weight TEXT NOT NULL DEFAULT 'none' CHECK (speed_weight IN ('none','low','medium','high')),
  category TEXT NOT NULL DEFAULT 'Fundamentos',
  judge_kind TEXT NOT NULL DEFAULT 'criteria' CHECK (judge_kind IN ('classic','criteria')),
  reference_prompt TEXT NOT NULL DEFAULT '',
  rubric TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS challenge_criteria (
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  criterion TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= 0),
  PRIMARY KEY (challenge_id, criterion)
) STRICT;

CREATE TABLE IF NOT EXISTS room_rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES arena_rooms(id),
  position INTEGER NOT NULL CHECK (position > 0),
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  modality TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','open','submitting','judging','results','closed')),
  started_at REAL,
  deadline_at REAL,
  paused_at REAL,
  ended_at REAL,
  created_at REAL NOT NULL,
  UNIQUE (room_id, position)
) STRICT;

CREATE TABLE IF NOT EXISTS arena_submissions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES arena_rooms(id),
  participant_id TEXT NOT NULL REFERENCES arena_participants(id),
  round_id TEXT NOT NULL REFERENCES room_rounds(id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  prompt TEXT NOT NULL,
  submitted_at REAL NOT NULL,
  UNIQUE (round_id, participant_id, attempt)
) STRICT;

CREATE TABLE IF NOT EXISTS arena_scores (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES arena_submissions(id),
  percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
  breakdown_json TEXT NOT NULL,
  feedback TEXT NOT NULL DEFAULT '',
  judge_status TEXT NOT NULL DEFAULT 'scored' CHECK (judge_status IN ('scored','failed','timeout')),
  points REAL CHECK (points IS NULL OR points >= 0),
  position INTEGER CHECK (position IS NULL OR position BETWEEN 1 AND 50),
  scoring_version TEXT,
  model TEXT,
  created_at REAL NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS arena_judge_attempts (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES arena_submissions(id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL,
  model TEXT,
  response_json TEXT,
  error TEXT,
  created_at REAL NOT NULL,
  UNIQUE (submission_id, attempt)
) STRICT;
