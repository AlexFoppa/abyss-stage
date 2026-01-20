PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_system (
  id INTEGER NOT NULL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  system_key TEXT NOT NULL,                 -- ex: 'candela_obscura', 'daggerheart'
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE (character_id, system_key),
  FOREIGN KEY (character_id) REFERENCES character(id)
);

CREATE INDEX IF NOT EXISTS ix_character_system_character_id
  ON character_system(character_id);

CREATE INDEX IF NOT EXISTS ix_character_system_system_key
  ON character_system(system_key);

-- cria um vínculo de sistema para todo character existente (baseado no character.system atual)
INSERT OR IGNORE INTO character_system (character_id, system_key, status)
SELECT id, system, 'ACTIVE'
FROM character
WHERE system IS NOT NULL AND TRIM(system) <> '';

-- normaliza base: todo PC/NPC deve ter um base "simplificado" no character.system
UPDATE character
SET system = 'simplificado'
WHERE system IS NULL OR TRIM(system) = '';
