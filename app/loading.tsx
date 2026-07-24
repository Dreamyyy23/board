export default function Loading() {
  return (
    <main className="loading-table" aria-live="polite" aria-busy="true">
      <div className="loading-table__sigil" aria-hidden="true">
        6
      </div>
      <span>OBSCUR · THE SIXFOLD ROAD</span>
      <h1>The table is finding its authority.</h1>
      <div className="loading-table__road" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <p>Restoring room state, private seat, and the latest structured event.</p>
    </main>
  );
}
