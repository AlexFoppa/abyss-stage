-- Candela equipment: add "uses improvisation slot" (max 3 per character)
ALTER TABLE candela_character_equipment
  ADD COLUMN uses_improvisation_slot INTEGER NOT NULL DEFAULT 0 CHECK(uses_improvisation_slot IN (0, 1));
