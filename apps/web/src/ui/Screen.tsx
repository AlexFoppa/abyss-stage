export function Screen({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="ui-screen">
      <h1 className="ui-title">Abyss Stage</h1>
      <div className="ui-subtitle">{title}</div>
      {children}
    </div>
  );
}
