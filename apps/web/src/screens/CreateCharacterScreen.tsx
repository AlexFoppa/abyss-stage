import { CharacterScreen } from "./CharacterScreen";
import type { Character } from "../types/character";

export function CreateCharacterScreen({
  onBack,
  onCreated,
  scope,
}: {
  onBack: () => void;
  onCreated?: (c: Character) => void;
  scope?: "ME" | "GM";
}) {
  return (
    <CharacterScreen
      mode="create"
      onBack={onBack}
      onCreated={onCreated}
      scope={scope}
    />
  );
}
