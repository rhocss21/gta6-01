// SOLMAR CITY — the police-dispatch panel: every live Solmar PD unit by
// callsign, with its role, distance and speed, straight from the police
// system. The panel is the chase's scoreboard: when a unit is close enough
// to ram, its role reads RAMMING; the helicopter always reads SPOTLIGHT.
import { CALLSIGNS } from './police.js';
import { flatDist } from './util.js';

function roleFor(car, px, pz, playerCar) {
  const d = flatDist(car.pos.x, car.pos.z, px, pz);
  const closing = playerCar
    ? Math.sin(car.heading) * Math.sin(playerCar.heading) + Math.cos(car.heading) * Math.cos(playerCar.heading) > 0.6
    : true;
  if (d < 15) return 'RAMMING';
  if (d < 45 && closing) return 'PURSUIT';
  if (d < 90) return 'FLANKING';
  return 'EN ROUTE';
}

export class DispatchPanel {
  constructor(rootEl) {
    this.root = rootEl; // the <div id="dispatch"> element
    this.rows = new Map(); // callsign -> row element
    this.clock = 0;
  }

  // Rebuild the rows when the unit set changes; update numbers every call.
  refresh(W, dt) {
    this.clock += dt;
    if (this.clock < 0.2) return; // ~5 Hz is plenty for a dispatch board
    this.clock = 0;
    const px = W.playerCar ? W.playerCar.pos.x : W.jax.pos.x;
    const pz = W.playerCar ? W.playerCar.pos.z : W.jax.pos.z;

    const units = [];
    W.pd.cars.forEach((car, i) => {
      units.push({
        name: CALLSIGNS[i % CALLSIGNS.length],
        role: roleFor(car, px, pz, W.playerCar),
        dist: Math.round(flatDist(car.pos.x, car.pos.z, px, pz)),
        speed: Math.round(Math.abs(car.speed) * 3.6),
        hot: flatDist(car.pos.x, car.pos.z, px, pz) < 15,
      });
    });
    W.pd.cops.forEach((cop, i) => {
      units.push({
        name: 'FOOT ' + (i + 1),
        role: W.playerCar ? 'ON FOOT' : 'CLOSING IN',
        dist: Math.round(flatDist(cop.pos.x, cop.pos.z, px, pz)),
        speed: Math.round(7 * 3.6),
        hot: flatDist(cop.pos.x, cop.pos.z, px, pz) < 8,
      });
    });
    if (W.pd.heli) {
      units.push({
        name: 'AIR ONE',
        role: 'SPOTLIGHT',
        dist: Math.round(flatDist(W.pd.heli.position.x, W.pd.heli.position.z, px, pz)),
        speed: Math.round(14 * 3.6),
        hot: true,
      });
    }
    // nearest first, so the closest threat is always on top
    units.sort((a, b) => a.dist - b.dist);

    const seen = new Set();
    for (const u of units) {
      seen.add(u.name);
      let row = this.rows.get(u.name);
      if (!row) {
        row = document.createElement('div');
        row.className = 'dispatch-row';
        row.innerHTML = '<span class="d-name"></span><span class="d-role"></span><span class="d-dist"></span>';
        this.root.appendChild(row);
        this.rows.set(u.name, row);
      }
      row.querySelector('.d-name').textContent = u.name;
      row.querySelector('.d-role').textContent = u.role;
      row.querySelector('.d-dist').textContent = u.dist + 'm · ' + u.speed + ' km/h';
      row.classList.toggle('hot', u.hot);
    }
    // drop rows for units that are gone
    for (const [name, row] of [...this.rows]) {
      if (!seen.has(name)) {
        row.remove();
        this.rows.delete(name);
      }
    }
    this.root.classList.toggle('hidden', units.length === 0);
  }
}
