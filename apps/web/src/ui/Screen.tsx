// apps/web/src/ui/Screen.tsx
export function Screen({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel">
      <h1>Abyss Stage</h1>
      <div
        style={{
          textAlign: "center",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          opacity: 0.85,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
