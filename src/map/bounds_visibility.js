// ============================================================
// bounds に基づいて tileLayer の opacity を切り替える
// ============================================================

// SAT (Separating Axis Theorem) による凸多角形同士の交差判定
function hasSeparatingAxis(polyA, polyB) {
  const n = polyA.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = polyA[i];
    const [bx, by] = polyA[(i + 1) % n];
    const nx = -(by - ay);
    const ny = bx - ax;
    let minA = Infinity, maxA = -Infinity;
    for (const [px, py] of polyA) {
      const d = px * nx + py * ny;
      if (d < minA) minA = d;
      if (d > maxA) maxA = d;
    }
    let minB = Infinity, maxB = -Infinity;
    for (const [px, py] of polyB) {
      const d = px * nx + py * ny;
      if (d < minB) minB = d;
      if (d > maxB) maxB = d;
    }
    if (maxA < minB || maxB < minA) return true;
  }
  return false;
}

// mapBounds (L.latLngBounds) と [[lat,lng],...] の凸多角形との交差判定
function viewportIntersectsPolygon(mapBounds, polygonLatLngs) {
  const rect = [
    [mapBounds.getWest(),  mapBounds.getSouth()],
    [mapBounds.getEast(),  mapBounds.getSouth()],
    [mapBounds.getEast(),  mapBounds.getNorth()],
    [mapBounds.getWest(),  mapBounds.getNorth()],
  ];
  const poly = polygonLatLngs.map(([lat, lng]) => [lng, lat]);
  return !hasSeparatingAxis(poly, rect) && !hasSeparatingAxis(rect, poly);
}

export function setupBoundsVisibility(map, groupLayers) {
  function updateVisibility() {
    const mapBounds = map.getBounds();

    groupLayers.forEach(({ group, tileLayers }) => {
      if (!map.hasLayer(group)) return;

      tileLayers.forEach(entry => {
        const shouldShow = entry.polygon
          ? viewportIntersectsPolygon(mapBounds, entry.polygon)
          : mapBounds.intersects(entry.bounds);

        if (shouldShow && !entry.inGroup) {
          entry.tileLayer.addTo(group);
          entry.inGroup = true;
        } else if (!shouldShow && entry.inGroup) {
          group.removeLayer(entry.tileLayer);
          entry.inGroup = false;
        }
      });
    });
  }

  map.on('overlayadd overlayremove baselayerchange', updateVisibility);
  map.on('moveend zoomend', updateVisibility);
  updateVisibility();

  return updateVisibility;
}
