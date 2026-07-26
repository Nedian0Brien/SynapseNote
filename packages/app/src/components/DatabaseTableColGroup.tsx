import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';

export function DatabaseTableColGroup({ geometry }: { geometry: DatabaseTableGeometry }) {
  const fillerTrack = <col data-database-table-filler-track data-database-table-filler />;
  const actionsTrack = (
    <col data-database-table-actions-track style={{ width: `${geometry.actionsTrackWidth}px` }} />
  );
  return (
    <colgroup data-database-table-colgroup>
      {geometry.selectorTrackWidth > 0 ? (
        <col
          data-database-table-selector-track
          style={{ width: `${geometry.selectorTrackWidth}px` }}
        />
      ) : null}
      {geometry.propertyTracks.map((track) => (
        <col
          key={track.propertyId}
          data-property-id={track.propertyId}
          data-database-table-property-track
          style={{ width: `${track.width}px` }}
        />
      ))}
      {geometry.surfaceMode === 'inline' ? (
        <>
          {actionsTrack}
          {fillerTrack}
        </>
      ) : (
        <>
          {fillerTrack}
          {actionsTrack}
        </>
      )}
    </colgroup>
  );
}
