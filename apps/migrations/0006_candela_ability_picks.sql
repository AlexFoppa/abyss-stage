PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS candela_character_ability_pick (
  character_id INTEGER NOT NULL,
  ability_id INTEGER NOT NULL,
  PRIMARY KEY (character_id, ability_id),
  FOREIGN KEY (character_id) REFERENCES candela_character_sheet(character_id),
  FOREIGN KEY (ability_id) REFERENCES candela_ability(id)
);

CREATE INDEX IF NOT EXISTS ix_candela_character_ability_pick_character_id
  ON candela_character_ability_pick(character_id);

CREATE INDEX IF NOT EXISTS ix_candela_character_ability_pick_ability_id
  ON candela_character_ability_pick(ability_id);
