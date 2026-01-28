import { CharacterScreen, type Character } from "./CharacterScreen";

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