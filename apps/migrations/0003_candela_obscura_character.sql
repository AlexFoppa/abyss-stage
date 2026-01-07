-- apps/migrations/0003_candela_obscura_character.sql
PRAGMA foreign_keys = ON;

-- =========================
-- FICHA INDIVIDUAL (Candela Obscura)
-- =========================

-- Cabeçalho 1:1 com character
CREATE TABLE IF NOT EXISTS candela_character_sheet (
  character_id INTEGER NOT NULL PRIMARY KEY,
  pronouns TEXT NOT NULL DEFAULT '',
  circle TEXT NOT NULL DEFAULT '',     -- "Círculo"
  style TEXT NOT NULL DEFAULT '',      -- "Estilo"
  catalyst TEXT NOT NULL DEFAULT '',   -- "Estopim"
  question TEXT NOT NULL DEFAULT '',   -- "Pergunta"
  backstory TEXT NOT NULL DEFAULT '',  -- história da ficha (separado do character.backstory)
  notes TEXT NOT NULL DEFAULT '',      -- "Anotações" da ficha
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

-- Catálogos (listas escolhíveis)
CREATE TABLE IF NOT EXISTS candela_role (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS candela_specialty (
  id INTEGER NOT NULL PRIMARY KEY,
  role_id INTEGER NOT NULL,                 -- vínculo obrigatório com Papel
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  image_storage_key TEXT NOT NULL DEFAULT '', -- ex: "candela/specialties/jornalista.png"
  FOREIGN KEY (role_id) REFERENCES candela_role(id)
);

CREATE INDEX IF NOT EXISTS ix_candela_specialty_role_id ON candela_specialty(role_id);

-- Vínculos da ficha com Papel e Especialidade (1:1 com a ficha)
CREATE TABLE IF NOT EXISTS candela_character_choice (
  character_id INTEGER NOT NULL PRIMARY KEY,
  role_id INTEGER NOT NULL,
  specialty_id INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (role_id) REFERENCES candela_role(id),
  FOREIGN KEY (specialty_id) REFERENCES candela_specialty(id)
);

CREATE INDEX IF NOT EXISTS ix_candela_character_choice_role_id
  ON candela_character_choice(role_id);

CREATE INDEX IF NOT EXISTS ix_candela_character_choice_specialty_id
  ON candela_character_choice(specialty_id);

-- Poderes (catálogo)
CREATE TABLE IF NOT EXISTS candela_power (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

-- Quais poderes estão disponíveis para cada Papel (N:N)
CREATE TABLE IF NOT EXISTS candela_role_power (
  role_id INTEGER NOT NULL,
  power_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, power_id),
  FOREIGN KEY (role_id) REFERENCES candela_role(id),
  FOREIGN KEY (power_id) REFERENCES candela_power(id)
);

-- Qual poder está disponível para cada Especialidade (1:1)
CREATE TABLE IF NOT EXISTS candela_specialty_power (
  specialty_id INTEGER NOT NULL PRIMARY KEY,
  power_id INTEGER NOT NULL,
  FOREIGN KEY (specialty_id) REFERENCES candela_specialty(id),
  FOREIGN KEY (power_id) REFERENCES candela_power(id)
);

-- Poderes escolhidos pelo personagem (do Papel) - permite vários, sem duplicar
CREATE TABLE IF NOT EXISTS candela_character_role_power_pick (
  character_id INTEGER NOT NULL,
  power_id INTEGER NOT NULL,
  PRIMARY KEY (character_id, power_id),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (power_id) REFERENCES candela_power(id)
);

CREATE INDEX IF NOT EXISTS ix_candela_character_role_power_pick_power_id
  ON candela_character_role_power_pick(power_id);

-- Poder escolhido da Especialidade (exatamente 1)
CREATE TABLE IF NOT EXISTS candela_character_specialty_power_pick (
  character_id INTEGER NOT NULL PRIMARY KEY,
  power_id INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (power_id) REFERENCES candela_power(id)
);

-- Grupos fixos: VIGOR / ASTUCIA / INTUICAO
CREATE TABLE IF NOT EXISTS candela_group (
  id INTEGER NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK(key IN ('VIGOR','ASTUCIA','INTUICAO')),
  name TEXT NOT NULL
);

-- Ações fixas e sua qualificação (rating 0..3) e se é dourada
-- A constraint UNIQUE(character_id, action_key) impede duplicadas.
-- A constraint FOREIGN KEY para candela_group garante que cada action pertence a um grupo válido.
CREATE TABLE IF NOT EXISTS candela_character_action (
  character_id INTEGER NOT NULL,
  action_key TEXT NOT NULL CHECK(action_key IN (
    'MOVER','ATACAR','CONTROLAR',
    'INFLUENCIAR','LER','ESCONDER',
    'AVALIAR','FOCAR','SENTIR'
  )),
  group_key TEXT NOT NULL CHECK(group_key IN ('VIGOR','ASTUCIA','INTUICAO')),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 3),
  gilded BOOLEAN NOT NULL DEFAULT 0 CHECK(gilded IN (0,1)),
  PRIMARY KEY (character_id, action_key),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (group_key) REFERENCES candela_group(key),
  -- trava o mapeamento ação -> grupo (não aceita combinações inválidas)
  CHECK (
    (group_key='VIGOR' AND action_key IN ('MOVER','ATACAR','CONTROLAR')) OR
    (group_key='ASTUCIA' AND action_key IN ('INFLUENCIAR','LER','ESCONDER')) OR
    (group_key='INTUICAO' AND action_key IN ('AVALIAR','FOCAR','SENTIR'))
  )
);

CREATE INDEX IF NOT EXISTS ix_candela_character_action_character_id
  ON candela_character_action(character_id);

CREATE INDEX IF NOT EXISTS ix_candela_character_action_group_key
  ON candela_character_action(character_id, group_key);

-- Estado do grupo (Motivações 0..9, Resistência 0..3), com máximo e atual
-- 1 linha por personagem por grupo.
CREATE TABLE IF NOT EXISTS candela_character_group_state (
  character_id INTEGER NOT NULL,
  group_key TEXT NOT NULL CHECK(group_key IN ('VIGOR','ASTUCIA','INTUICAO')),
  drive_current INTEGER NOT NULL DEFAULT 0 CHECK(drive_current BETWEEN 0 AND 9),
  drive_max INTEGER NOT NULL DEFAULT 0 CHECK(drive_max BETWEEN 0 AND 9),
  resist_current INTEGER NOT NULL DEFAULT 0 CHECK(resist_current BETWEEN 0 AND 3),
  resist_max INTEGER NOT NULL DEFAULT 0 CHECK(resist_max BETWEEN 0 AND 3),
  PRIMARY KEY (character_id, group_key),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (group_key) REFERENCES candela_group(key),
  CHECK(drive_current <= drive_max),
  CHECK(resist_current <= resist_max)
);

CREATE INDEX IF NOT EXISTS ix_candela_character_group_state_character_id
  ON candela_character_group_state(character_id);

-- Marcas (CORPO / MENTE / SANGRIA) 0..3 com máximo/atual
CREATE TABLE IF NOT EXISTS candela_character_mark (
  character_id INTEGER NOT NULL,
  mark_key TEXT NOT NULL CHECK(mark_key IN ('CORPO','MENTE','SANGRIA')),
  current INTEGER NOT NULL DEFAULT 0 CHECK(current BETWEEN 0 AND 3),
  max INTEGER NOT NULL DEFAULT 0 CHECK(max BETWEEN 0 AND 3),
  PRIMARY KEY (character_id, mark_key),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  CHECK(current <= max)
);


CREATE INDEX IF NOT EXISTS ix_candela_character_mark_character_id
  ON candela_character_mark(character_id);

-- Listas livres por enquanto
CREATE TABLE IF NOT EXISTS candela_character_relation (
  id INTEGER NOT NULL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id)
);

CREATE TABLE IF NOT EXISTS candela_character_equipment (
  id INTEGER NOT NULL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id)
);

CREATE TABLE IF NOT EXISTS candela_character_illumination_key (
  id INTEGER NOT NULL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id)
);


CREATE TABLE IF NOT EXISTS candela_specialty_action_default (
  specialty_id INTEGER NOT NULL,
  action_key TEXT NOT NULL CHECK(action_key IN (
    'MOVER','ATACAR','CONTROLAR',
    'INFLUENCIAR','LER','ESCONDER',
    'AVALIAR','FOCAR','SENTIR'
  )),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 3),
  gilded_default BOOLEAN NOT NULL DEFAULT 0 CHECK(gilded_default IN (0,1)),
  PRIMARY KEY (specialty_id, action_key),
  FOREIGN KEY (specialty_id) REFERENCES candela_specialty(id)
);

CREATE TABLE IF NOT EXISTS candela_specialty_group_default (
  specialty_id INTEGER NOT NULL,
  group_key TEXT NOT NULL CHECK(group_key IN ('VIGOR','ASTUCIA','INTUICAO')),
  drive_default INTEGER NOT NULL CHECK(drive_default BETWEEN 0 AND 9),
  PRIMARY KEY (specialty_id, group_key),
  FOREIGN KEY (specialty_id) REFERENCES candela_specialty(id)
);


-- Seed mínimo dos grupos (para permitir FKs por key)
INSERT OR IGNORE INTO candela_group (key, name) VALUES
  ('VIGOR','Vigor'),
  ('ASTUCIA','Astúcia'),
  ('INTUICAO','Intuição');

CREATE TABLE IF NOT EXISTS candela_character_scar (
  id INTEGER NOT NULL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  mark_key TEXT NOT NULL CHECK(mark_key IN ('CORPO','MENTE','SANGRIA')),
  description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id, mark_key) REFERENCES candela_character_mark(character_id, mark_key)
);

-- Habilidades (catálogo)
CREATE TABLE IF NOT EXISTS candela_ability (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('ROLE','SPECIALTY')),
  role_id INTEGER,
  specialty_id INTEGER,
  UNIQUE(name, scope),
  FOREIGN KEY (role_id) REFERENCES candela_role(id),
  FOREIGN KEY (specialty_id) REFERENCES candela_specialty(id),
  CHECK (
    (scope='ROLE' AND role_id IS NOT NULL AND specialty_id IS NULL) OR
    (scope='SPECIALTY' AND specialty_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_candela_ability_role_id
  ON candela_ability(role_id);

CREATE INDEX IF NOT EXISTS ix_candela_ability_specialty_id
  ON candela_ability(specialty_id);
