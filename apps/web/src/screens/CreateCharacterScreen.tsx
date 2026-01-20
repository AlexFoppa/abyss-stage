import { CharacterScreen, type Character } from "./CharacterScreen";

export function CreateCharacterScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: (c: Character) => void;
}) {
  return <CharacterScreen mode="create" onBack={onBack} onCreated={onCreated} />;
}
