import { CharacterScreen, type Character } from "./CharacterScreen";

export function EditCharacterScreen({
  character,
  onBack,
}: {
  character: Character | null;
  onBack: () => void;
}) {
  return <CharacterScreen mode="edit" character={character} onBack={onBack} />;
}
