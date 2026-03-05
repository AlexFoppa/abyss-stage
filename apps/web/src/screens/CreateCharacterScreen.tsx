import { CharacterScreen } from "./CharacterScreen";
import type { Character } from "../types/character";

export function CreateCharacterScreen({
  onBack,
  onCreated,
  scope,
  initialKind,
}: {
  onBack: () => void;
  onCreated?: (c: Character) => void;
  scope?: "ME" | "GM";
  /** Quando scope=GM, kind a enviar na criação (PC ou NPC). */
  initialKind?: "PC" | "NPC";
}) {
  return (
    <CharacterScreen
      mode="create"
      onBack={onBack}
      onCreated={onCreated}
      scope={scope}
      initialKind={initialKind}
    />
  );
}
