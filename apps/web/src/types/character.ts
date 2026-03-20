/**
 * Tipos compartilhados de personagem (alinhados ao backend).
 * Character = jogador (/me/characters); GMCharacter = lista do mestre (/gm/characters).
 */

export type CharacterBase = {
  id: number;
  name: string;
  concept?: string;
  system?: string;
  backstory?: string;
  notes?: string;
  systems?: string[];
  default_image_url?: string | null;
  default_image_rev?: string | null;
  kind?: "PC" | "NPC";
  owner_email?: string | null;
  owner_name?: string | null;
};

/** Personagem na visão do jogador (compatível com /me/characters). */
export type Character = CharacterBase;

/** Personagem na visão do mestre (compatível com /gm/characters): owner_email e kind opcionais (NPC não tem dono). */
export type GMCharacter = CharacterBase;
