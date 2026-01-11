// 標高の取得
export function updateElevation(lat, lng, element, callback) {
  const elevationUrl = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}`;

  fetch(elevationUrl)
  .then(response => response.json())
  .then(data => {
    const elevation = data.elevation;
    if (elevation !== undefined) {
      element.textContent = elevation.toFixed(2);
      if (callback) callback(elevation);
    } else {
      element.textContent = 'N/A';
      if (callback) callback(null);
    }
  })
  .catch(error => {
    console.error('Error fetching elevation data:', error);
    element.textContent = 'Error';
    if (callback) callback(null);
  });
}