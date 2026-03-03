import { CharacterScreen } from "./CharacterScreen";
import type { Character } from "../types/character";

export function EditCharacterScreen({
  character,
  onBack,
  scope,
}: {
  character: Character | null;
  onBack: () => void;
  scope?: "ME" | "GM";
}) {
  return (
    <CharacterScreen mode="edit" character={character} onBack={onBack} scope={scope} />
  );
}