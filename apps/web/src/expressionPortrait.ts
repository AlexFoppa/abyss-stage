/**
 * Única fonte de verdade para retrato + expressão (slot 0–9) no lobby/palco.
 *
 * Precedência da **URL final**:
 * 1. `previewUrl` em `expressionOverrideByCharacterId` (activo enquanto `now < until`) — veio do mestre no LiveKit.
 * 2. `expressionRemotePortraitByCharacterId` + `expressionCurrentByCharacterId` — retrato fixo após `expression/current` do mestre,
 *    excepto durante a janela de override por personagem (preview por slot sem URL explícita).
 * 3. Mapa **slot → URL** (atlas) conforme `pickAtlasUrlForSlot` — ver precedência lá dentro.
 * 4. Imagem única: `participant.character_image_url` → `stageFallbackImageUrl` → `defaultImg`.
 *
 * O **slot efectivo** (antes do passo 3): preview local (tecla ainda premida no jogador/mestre a conduzir) → override LiveKit por id
 * → override por identity → `expressionCurrentByCharacterId` → `expressionCurrentByIdentity` → slot do lobby → 0.
 */
import type { LobbyParticipant } from "./screens/LobbyScreen";

export type ExpressionAtlasMaps = {
  gmStageSlotImagesBy: Record<number, Record<number, string>>;
  localCharacterImageBySlot: Record<number, string>;
};

export type ExpressionSyncState = {
  expressionOverrideByCharacterId: Record<number, { slot: number; until: number; previewUrl?: string | null }>;
  expressionRemotePortraitByCharacterId: Record<number, string>;
  expressionCurrentByCharacterId: Record<number, number>;
  expressionOverrideByIdentity: Record<string, { slot: number; until: number }>;
  expressionCurrentByIdentity: Record<string, number>;
};

/** Atlas slot→URL: mestre a conduzir usa atlas GM; senão lobby; senão atlas do jogador local só na sua linha. */
export function pickAtlasUrlForSlot(
  characterId: number,
  effectiveSlot: number,
  opts: {
    participant: LobbyParticipant | null;
    localIdentity: string | null;
    isGM: boolean;
    gmDrivingThis: boolean;
    maps: ExpressionAtlasMaps;
  }
): string | undefined {
  const { participant, localIdentity, isGM, gmDrivingThis, maps } = opts;
  const playerIsThisRow =
    !isGM && localIdentity != null && participant != null && participant.identity === localIdentity;

  const gmSlots = maps.gmStageSlotImagesBy[characterId];
  const hasGmSlots = gmSlots != null && typeof gmSlots === "object" && Object.keys(gmSlots).length > 0;
  const fromLobby = participant?.character_image_by_slot;
  const hasLobbySlots =
    fromLobby != null && typeof fromLobby === "object" && Object.keys(fromLobby).length > 0;

  const slotMap =
    gmDrivingThis && hasGmSlots
      ? gmSlots
      : hasLobbySlots
        ? fromLobby
        : playerIsThisRow && Object.keys(maps.localCharacterImageBySlot).length > 0
          ? maps.localCharacterImageBySlot
          : undefined;

  if (slotMap == null) return undefined;
  const u = slotMap[effectiveSlot] ?? slotMap[0];
  return typeof u === "string" && u !== "" ? u : undefined;
}

export function effectiveExpressionSlot(params: {
  now: number;
  characterId: number;
  identity: string;
  lobbySlot: number | null | undefined;
  temporaryOverride: { slot: number; until: number } | null;
  gmEspExpression: boolean;
  gmExpressionCharacterIds: number[];
  sync: ExpressionSyncState;
  isGM: boolean;
  localIdentity: string | null;
}): number {
  const {
    now,
    characterId: cid,
    identity,
    lobbySlot,
    temporaryOverride,
    gmEspExpression,
    gmExpressionCharacterIds,
    sync,
    isGM,
    localIdentity,
  } = params;

  const gmDrivingThis = gmEspExpression && gmExpressionCharacterIds.includes(cid);
  const playerIsThisRow = !isGM && localIdentity != null && identity === localIdentity;
  const localPreviewActive =
    temporaryOverride != null &&
    now < temporaryOverride.until &&
    (playerIsThisRow || gmDrivingThis);
  const localPreviewSlot = localPreviewActive ? temporaryOverride.slot : null;

  const cOv = sync.expressionOverrideByCharacterId[cid];
  const charPreview = cOv && now < cOv.until ? cOv.slot : null;
  const iOv = sync.expressionOverrideByIdentity[identity];
  const idPreview = iOv && now < iOv.until ? iOv.slot : null;

  const fixedSlot =
    sync.expressionCurrentByCharacterId[cid] ??
    sync.expressionCurrentByIdentity[identity] ??
    (typeof lobbySlot === "number" ? lobbySlot : undefined) ??
    0;

  return localPreviewSlot ?? charPreview ?? idPreview ?? fixedSlot;
}

export function resolvePortraitUrlForCharacter(params: {
  now: number;
  characterId: number;
  identity: string;
  lobbySlot: number | null | undefined;
  participant: LobbyParticipant | null;
  stageFallbackImageUrl: string | null | undefined;
  defaultImg: string;
  temporaryOverride: { slot: number; until: number } | null;
  gmEspExpression: boolean;
  gmExpressionCharacterIds: number[];
  sync: ExpressionSyncState;
  maps: ExpressionAtlasMaps;
  isGM: boolean;
  localIdentity: string | null;
}): string {
  const {
    now,
    characterId: cid,
    identity,
    lobbySlot,
    participant,
    stageFallbackImageUrl,
    defaultImg,
    temporaryOverride,
    gmEspExpression,
    gmExpressionCharacterIds,
    sync,
    maps,
    isGM,
    localIdentity,
  } = params;

  const gmDrivingThis = gmEspExpression && gmExpressionCharacterIds.includes(cid);
  const cOv = sync.expressionOverrideByCharacterId[cid];

  if (cOv && now < cOv.until && typeof cOv.previewUrl === "string" && cOv.previewUrl !== "") {
    return cOv.previewUrl;
  }

  const effectiveSlot = effectiveExpressionSlot({
    now,
    characterId: cid,
    identity,
    lobbySlot,
    temporaryOverride,
    gmEspExpression,
    gmExpressionCharacterIds,
    sync,
    isGM,
    localIdentity,
  });

  const atlasUrl = pickAtlasUrlForSlot(cid, effectiveSlot, {
    participant,
    localIdentity,
    isGM,
    gmDrivingThis,
    maps,
  });

  let url =
    atlasUrl ??
    (typeof participant?.character_image_url === "string" && participant.character_image_url !== ""
      ? participant.character_image_url
      : null) ??
    (typeof stageFallbackImageUrl === "string" && stageFallbackImageUrl !== "" ? stageFallbackImageUrl : null) ??
    defaultImg;

  const remoteFixed = sync.expressionRemotePortraitByCharacterId[cid];
  if (
    remoteFixed != null &&
    remoteFixed !== "" &&
    sync.expressionCurrentByCharacterId[cid] != null &&
    !(cOv && now < cOv.until)
  ) {
    url = remoteFixed;
  }

  return url;
}

/** URLs por personagem num slot dado — mesmo atlas que o palco; usado ao publicar `previewUrlByCharacterId` / `portraitUrlByCharacterId`. */
export function buildExpressionUrlMapForPublish(
  characterIds: number[],
  slot: number,
  displayParticipants: LobbyParticipant[],
  gmStageSlotImagesBy: Record<number, Record<number, string>>,
  gmExpressionTargets: Array<{ id: number; imageUrl?: string | null }>
): Record<number, string> {
  const maps: ExpressionAtlasMaps = { gmStageSlotImagesBy, localCharacterImageBySlot: {} };
  const out: Record<number, string> = {};
  for (const id of characterIds) {
    const p = displayParticipants.find((q) => !q.is_gm && q.character_id === id) ?? null;
    const t = gmExpressionTargets.find((x) => x.id === id);
    const u = pickAtlasUrlForSlot(id, slot, {
      participant: p,
      localIdentity: null,
      isGM: true,
      gmDrivingThis: true,
      maps,
    });
    const fallback =
      (typeof t?.imageUrl === "string" && t.imageUrl !== "" ? t.imageUrl : undefined) ??
      (typeof p?.character_image_url === "string" && p.character_image_url !== "" ? p.character_image_url : undefined);
    if (u != null) out[id] = u;
    else if (fallback != null) out[id] = fallback;
  }
  return out;
}
