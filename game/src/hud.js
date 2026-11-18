// HUD: DOM readouts + a minimap canvas drawn from the same road graph the
// game drives on, so the map can never disagree with the world.
import { AVENUES, STREETS, BEACH_Z, SEA_Z } from './roads.js';
import { districtAt } from './city.js';
import { currentObjective } from './missions.js';

const MAP_W = 230, MAP_H = 190;
const X0 = -330, X1 = 330, Z0 = -240, Z1 = 300;

export function initHud(store, ui) {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('cash'), stars: $('stars'), health: $('healthFill'), healthWrap: $('healthBar'),
    objective: $('objective'), objTitle: $('objTitle'), objLabel: $('objLabel'),
    feed: $('feed'), speed: $('speed'), speedVal: $('speedVal'), speedUnit: $('speedUnit'),
    district: $('district'), minimap: $('minimap'), crosshair: $('crosshair'),
    start: $('startScreen'), pause: $('pauseScreen'), busted: $('bustedScreen'),
    menu: $('missionMenu'), menuList: $('missionList'), toast: $('toast'),
    hint: $('hint'), wanted: $('wantedWrap'),
  };
  const ctx = els.minimap.getContext('2d');
  const feedLines = [];
  let toastTimer = 0;

  function log(msg) {
    feedLines.unshift(msg);
    if (feedLines.length > 4) feedLines.pop();
    els.feed.innerHTML = feedLines.map((m) => `<div>${m}</div>`).join('');
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.style.opacity = '1';
    toastTimer = 3;
  }
  function starString(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function drawMinimap() {
    const w = MAP_W, h = MAP_H;
    const px = (x) => ((x - X0) / (X1 - X0)) * w;
    const pz = (z) => ((z - Z0) / (Z1 - Z0)) * h;
    ctx.fillStyle = '#20262b'; ctx.fillRect(0, 0, w, h);
    // sea + beach
    ctx.fillStyle = '#3f8ea8'; ctx.fillRect(0, pz(SEA_Z), w, h - pz(SEA_Z));
    ctx.fillStyle = '#ecd9a8'; ctx.fillRect(0, pz(BEACH_Z), w, pz(SEA_Z) - pz(BEACH_Z));
    // park
    ctx.fillStyle = '#5d8f43'; ctx.fillRect(px(-90), pz(-60), px(90) - px(-90), pz(60) - pz(-60));
    // roads
    ctx.strokeStyle = '#8a8578'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const ax of AVENUES) { ctx.beginPath(); ctx.moveTo(px(ax), pz(STREETS[0])); ctx.lineTo(px(ax), pz(STREETS[STREETS.length - 1])); ctx.stroke(); }
    for (const sz of STREETS) { ctx.beginPath(); ctx.moveTo(px(AVENUES[0]), pz(sz)); ctx.lineTo(px(AVENUES[AVENUES.length - 1]), pz(sz)); ctx.stroke(); }
    ctx.strokeStyle = '#e8d9a8'; ctx.lineWidth = 1;
    for (const ax of AVENUES) { ctx.beginPath(); ctx.moveTo(px(ax), pz(STREETS[0])); ctx.lineTo(px(ax), pz(STREETS[STREETS.length - 1])); ctx.stroke(); }
    // mission marker
    const obj = currentObjective(store.missions);
    if (obj && obj.marker) {
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(px(obj.marker.x), pz(obj.marker.z), 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    // traffic dots
    ctx.fillStyle = '#c9c9c9';
    for (const c of store.traffic) { ctx.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3); }
    // police
    ctx.fillStyle = '#3b82f6';
    for (const c of store.wanted.policeCars) { ctx.beginPath(); ctx.arc(px(c.x), pz(c.z), 4, 0, Math.PI * 2); ctx.fill(); }
    // player arrow
    const p = store.player;
    ctx.save();
    ctx.translate(px(p.x), pz(p.z));
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e86a2a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function update(dt) {
    const s = store;
    els.cash.textContent = `$${s.cash.toLocaleString('en-US')}`;
    els.stars.textContent = starString(s.wanted.stars);
    els.stars.style.color = s.wanted.stars > 0 ? '#ffcf3c' : '#ffffff88';
    els.wanted.style.display = s.wanted.stars > 0 ? 'block' : 'none';
    const hp = s.player.onFoot ? s.player.health : (s.playerCar ? s.playerCar.health : 100);
    els.health.style.width = `${Math.max(0, hp)}%`;
    els.health.style.background = hp > 50 ? '#58c96b' : hp > 25 ? '#e8a13c' : '#d92b1f';
    els.district.textContent = districtAt(s.player.x, s.player.z);
    const obj = currentObjective(s.missions);
    if (obj) {
      els.objective.style.display = 'block';
      els.objTitle.textContent = obj.mission;
      els.objLabel.textContent = obj.label;
    } else {
      els.objective.style.display = 'none';
    }
    if (!s.player.onFoot && s.playerCar) {
      els.speed.style.display = 'block';
      els.speedVal.textContent = Math.round(Math.abs(s.playerCar.speed) * 3.6);
      els.speedUnit.textContent = s.playerCar.model.name;
    } else {
      els.speed.style.display = 'none';
    }
    els.crosshair.style.display = (s.player.onFoot && s.player.armed) ? 'block' : 'none';
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) els.toast.style.opacity = '0'; }
    drawMinimap();
  }

  function showStart() { els.start.style.display = 'flex'; }
  function hideStart() { els.start.style.display = 'none'; }
  function showPause(on) { els.pause.style.display = on ? 'flex' : 'none'; }
  function showBusted() { els.busted.style.display = 'flex'; }
  function hideBusted() { els.busted.style.display = 'none'; }
  function showMenu(listHtml) { els.menuList.innerHTML = listHtml; els.menu.style.display = 'flex'; }
  function hideMenu() { els.menu.style.display = 'none'; }

  return { log, toast, update, showStart, hideStart, showPause, showBusted, hideBusted, showMenu, hideMenu, els };
}
