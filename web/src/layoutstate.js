/* Which station the layout sheet shows, and the change (from line to line) it should highlight. Set before opening the 'layout' modal. */
export const LAY = { name: '', from: '', to: '' };
export const setLay = (name, from, to) => { LAY.name = name || ''; LAY.from = from || ''; LAY.to = to || ''; };
