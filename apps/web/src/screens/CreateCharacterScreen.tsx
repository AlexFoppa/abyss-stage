import { CharacterScreen, type Character } from "./CharacterScreen";

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
