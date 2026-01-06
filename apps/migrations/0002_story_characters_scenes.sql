PRAGMA foreign_keys = ON;

-- Controle opcional de versões aplicadas (útil quando você criar um runner)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Cenários (imagem + descrição) criados pelo GM
CREATE TABLE IF NOT EXISTS setting (
  id INTEGER NOT NULL PRIMARY KEY,
  gm_id INTEGER NOT NULL,
  name TEXT,
  description TEXT NOT NULL DEFAULT '',
  image_storage_key TEXT,         -- caminho/“key” do arquivo fora do SQLite
  image_mime TEXT,
  image_size_bytes INTEGER,
  image_sha256 TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (gm_id) REFERENCES "user"(id)          -- RESTRICT/NO ACTION (padrão)
);

CREATE INDEX IF NOT EXISTS ix_setting_gm_id ON setting(gm_id);

-- História (unifica “jogo” + “história”), vinculada ao GM
CREATE TABLE IF NOT EXISTS story (
  id INTEGER NOT NULL PRIMARY KEY,
  gm_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system TEXT NOT NULL,            -- ex.: 'CANDELA_OBSCURA'
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (gm_id) REFERENCES "user"(id)
);

CREATE INDEX IF NOT EXISTS ix_story_gm_id ON story(gm_id);
CREATE INDEX IF NOT EXISTS ix_story_system ON story(system);

-- Personagem “completo” (serve tanto para PC quanto NPC completo)
-- NPC completo pode ser transferido para PLAYER alterando owner_user_id (e opcionalmente kind).
CREATE TABLE IF NOT EXISTS character (
  id INTEGER NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('PC','NPC')),  -- PC (player character) | NPC completo
  owner_user_id INTEGER,                          -- PC: obrigatório | NPC: pode ser NULL
  created_by_gm_id INTEGER,                       -- NPC: obrigatório | PC: pode ser NULL
  name TEXT NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  system TEXT NOT NULL,
  backstory TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  dataset_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES "user"(id),
  FOREIGN KEY (created_by_gm_id) REFERENCES "user"(id),
  CHECK (
    (kind='PC'  AND owner_user_id IS NOT NULL)
    OR
    (kind='NPC' AND created_by_gm_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_character_owner_user_id ON character(owner_user_id);
CREATE INDEX IF NOT EXISTS ix_character_created_by_gm_id ON character(created_by_gm_id);
CREATE INDEX IF NOT EXISTS ix_character_system ON character(system);
CREATE INDEX IF NOT EXISTS ix_character_kind ON character(kind);

-- Imagens (0..9) do personagem completo (metadados no DB; conteúdo fora)
CREATE TABLE IF NOT EXISTS character_image (
  character_id INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 9),
  storage_key TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, slot),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

CREATE INDEX IF NOT EXISTS ix_character_image_character_id ON character_image(character_id);

-- NPC simplificado (separado)
CREATE TABLE IF NOT EXISTS npc_simplified (
  id INTEGER NOT NULL PRIMARY KEY,
  gm_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  system TEXT NOT NULL,
  backstory TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (gm_id) REFERENCES "user"(id)
);

CREATE INDEX IF NOT EXISTS ix_npc_simplified_gm_id ON npc_simplified(gm_id);
CREATE INDEX IF NOT EXISTS ix_npc_simplified_system ON npc_simplified(system);

-- Imagens (0..2) do NPC simplificado
CREATE TABLE IF NOT EXISTS npc_simplified_image (
  npc_id INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2),
  storage_key TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (npc_id, slot),
  FOREIGN KEY (npc_id) REFERENCES npc_simplified(id)
);

CREATE INDEX IF NOT EXISTS ix_npc_simplified_image_npc_id ON npc_simplified_image(npc_id);

-- Elenco da história (quem faz parte do “jogo”)
CREATE TABLE IF NOT EXISTS story_character (
  story_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  PRIMARY KEY (story_id, character_id),
  FOREIGN KEY (story_id) REFERENCES story(id),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

CREATE INDEX IF NOT EXISTS ix_story_character_story_id ON story_character(story_id);
CREATE INDEX IF NOT EXISTS ix_story_character_character_id ON story_character(character_id);

CREATE TABLE IF NOT EXISTS story_npc_simplified (
  story_id INTEGER NOT NULL,
  npc_id INTEGER NOT NULL,
  PRIMARY KEY (story_id, npc_id),
  FOREIGN KEY (story_id) REFERENCES story(id),
  FOREIGN KEY (npc_id) REFERENCES npc_simplified(id)
);

CREATE INDEX IF NOT EXISTS ix_story_npc_simplified_story_id ON story_npc_simplified(story_id);
CREATE INDEX IF NOT EXISTS ix_story_npc_simplified_npc_id ON story_npc_simplified(npc_id);

-- Cenas (ordenadas; sem empates)
CREATE TABLE IF NOT EXISTS scene (
  id INTEGER NOT NULL PRIMARY KEY,
  story_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  title TEXT,
  setting_id INTEGER,                 -- cenário opcional
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (story_id) REFERENCES story(id),
  FOREIGN KEY (setting_id) REFERENCES setting(id),
  UNIQUE (story_id, position)         -- garante “sem empates”
);

CREATE INDEX IF NOT EXISTS ix_scene_story_id ON scene(story_id);
CREATE INDEX IF NOT EXISTS ix_scene_setting_id ON scene(setting_id);
CREATE INDEX IF NOT EXISTS ix_scene_story_pos ON scene(story_id, position);

-- Elenco da cena (quem está presente)
CREATE TABLE IF NOT EXISTS scene_character (
  scene_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  PRIMARY KEY (scene_id, character_id),
  FOREIGN KEY (scene_id) REFERENCES scene(id),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

CREATE INDEX IF NOT EXISTS ix_scene_character_scene_id ON scene_character(scene_id);
CREATE INDEX IF NOT EXISTS ix_scene_character_character_id ON scene_character(character_id);

CREATE TABLE IF NOT EXISTS scene_npc_simplified (
  scene_id INTEGER NOT NULL,
  npc_id INTEGER NOT NULL,
  PRIMARY KEY (scene_id, npc_id),
  FOREIGN KEY (scene_id) REFERENCES scene(id),
  FOREIGN KEY (npc_id) REFERENCES npc_simplified(id)
);

CREATE INDEX IF NOT EXISTS ix_scene_npc_simplified_scene_id ON scene_npc_simplified(scene_id);
CREATE INDEX IF NOT EXISTS ix_scene_npc_simplified_npc_id ON scene_npc_simplified(npc_id);

-- Fichas por sistema: começamos com Candela Obscura (estrutura detalhada depois)
CREATE TABLE IF NOT EXISTS sheet_candela_obscura (
  character_id INTEGER NOT NULL PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

CREATE TABLE IF NOT EXISTS sheet_candela_obscura_npc_simplified (
  npc_id INTEGER NOT NULL PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (npc_id) REFERENCES npc_simplified(id)
);
