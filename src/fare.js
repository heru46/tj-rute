// Tarif per itinerary dari fare_attributes/fare_rules GTFS.
// FP dan FP2 (Rp3.500) adalah satu grup integrasi: dibayar sekali selama naik
// berikutnya masih dalam transfer_duration sejak tap berbayar pertama.
// Tarif lain (GR gratis, PP Royaltrans) dihitung per naik.

const INTEGRATED = new Set(['FP', 'FP2']);

export function price(itinerary, network) {
  const perLeg = [];
  let windowStart = null;
  let windowSec = 0;
  for (const leg of itinerary.legs) {
    if (leg.type !== 'ride') continue;
    const fareId = network.routes[leg.route].fare;
    const fare = network.fares[fareId];
    if (INTEGRATED.has(fareId)) {
      if (windowStart !== null && leg.boardSec - windowStart <= windowSec) {
        perLeg.push(0);
      } else {
        windowStart = leg.boardSec;
        windowSec = fare.transferSec;
        perLeg.push(fare.price);
      }
    } else {
      perLeg.push(fare.price);
    }
  }
  return { total: perLeg.reduce((a, b) => a + b, 0), perLeg };
}
