/* A small 3D train, tram, bus or regional train that rides on top of the 2D map at the position of the journey marker.
 * Loaded on demand (three.js is shared with the walking figure). Not clickable, so the map stays fully usable underneath. */
export class Vehicle2D {
  constructor(host, size) {
    this.size = size || 120; this.kind = null; this.color = null; this.stage = null; this.dead = false; this.on = false;
    const c = document.createElement('canvas'); c.className = 'veh2d'; c.width = this.size; c.height = this.size;
    c.style.cssText = 'position:absolute;left:0;top:0;width:' + this.size + 'px;height:' + this.size + 'px;pointer-events:none;z-index:3;display:none;will-change:transform';
    host.appendChild(c); this.cv = c;
    import('./avatar3d.js').then((m) => {
      if (this.dead) return; this.m = m;
      try { this.stage = new m.Stage3D(c, { size: this.size, pitch: 52, fov: 26 }); this.stage.setHeading(0, true); this.ready = true; if (this.kind) this._build(); } catch (e) { this.fail = true; }
    }).catch(() => { this.fail = true; });
  }
  _build() { if (!this.stage || !this.kind) return; this.stage.set(this.m.buildVehicle(this.kind, this.color)); this.built = this.kind + this.color; }
  /* x, y in map pixels, ang in radians on screen (0 = right), kind/color of the line */
  update(x, y, ang, kind, color, dt) {
    if (this.dead || this.fail) return false;
    this.kind = kind; this.color = color;
    if (this.stage && this.built !== kind + color) this._build();
    if (!this.stage) return false;
    const h = ang * 180 / Math.PI + 90;
    this.stage.setHeading(h, !this.on);
    this.cv.style.transform = 'translate(' + Math.round(x - this.size / 2) + 'px,' + Math.round(y - this.size / 2 - 6) + 'px)';
    if (!this.on) { this.on = true; this.cv.style.display = 'block'; }
    this.stage.frame(dt || 0.016, {});
    return true;
  }
  hide() { if (this.on) { this.on = false; this.cv.style.display = 'none'; } }
  destroy() { this.dead = true; try { this.stage && this.stage.destroy(); } catch (e) { /* ignore */ } try { this.cv.remove(); } catch (e) { /* ignore */ } }
}
