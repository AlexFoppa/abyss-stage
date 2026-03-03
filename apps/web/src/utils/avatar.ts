/**
 * Helper único para URL do avatar (imagem do personagem).
 * Aceita default_image_url + default_image_rev ou character_image_url (ex.: lobby).
 */

const FALLBACK_AVATAR = "/assets/jogador_default.png";

export type AvatarSource = {
  default_image_url?: string | null;
  default_image_rev?: string | null;
  character_image_url?: string | null;
};

/**
 * Retorna a URL do avatar para exibir, ou o fallback.
 * Usa default_image_url (e opcionalmente default_image_rev) quando presentes;
 * senão usa character_image_url quando for o único campo de imagem (ex.: LobbyParticipant).
 */
export function getAvatarUrl(c: AvatarSource | null | undefined): string {
  if (!c) return FALLBACK_AVATAR;
  const defaultUrl = c.default_image_url;
  if (defaultUrl) {
    if (c.default_image_rev) return `${defaultUrl}?rev=${encodeURIComponent(c.default_image_rev)}`;
    return defaultUrl;
  }
  const singleUrl = c.character_image_url;
  if (singleUrl) return singleUrl;
  return FALLBACK_AVATAR;
}
