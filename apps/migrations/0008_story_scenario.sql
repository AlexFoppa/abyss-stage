PRAGMA foreign_keys = ON;

-- Cenários explicitamente adicionados à história (barra lateral do editor), além dos vinculados só via cena.
CREATE TABLE IF NOT EXISTS story_scenario (
  story_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  PRIMARY KEY (story_id, scenario_id),
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE,
  FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_story_scenario_story_id ON story_scenario(story_id);
CREATE INDEX IF NOT EXISTS ix_story_scenario_scenario_id ON story_scenario(scenario_id);
