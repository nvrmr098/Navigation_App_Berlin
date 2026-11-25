/* Live trip logic: real arrival time, the train after a change, connection check, lift notices and crowding.
 * Data: public VBB transport.rest (same free source as the departure boards). Everything fails soft. */
import { journeys, board, pickTrains } from './live.js';

const MIN_TRANSFER = 60000; // at least one minute to change trains

const transit = (j) => j.legs.filter((l) => !l.walk && l.line);

/* the journey from the next stop to the destination that uses the lines of the rest of our route */
export async function fetchTrip(route, li, nextName, destName) {
  const want = route.legs.slice(li).map((l) => l.line);
  const list = await journeys(nextName, destName, { results: 4, when: Date.now() - 20000 });
  const fits = list.filter((j) => {
    const t = transit(j).map((l) => l.line);
    return t.length === want.length && t.every((x, i) => x === want[i]);
  });
  const j = fits[0] || list[0];
  if (!j) throw new Error('no journey');
  const tl = transit(j), first = tl[0], second = tl[1] || null;
  const out = {
    at: Date.now(), exact: !!fits.length,
    arr: j.arr, planArr: tl.length ? tl[tl.length - 1].planArr : j.arr,
    legEnd: first ? first.arr : j.arr, legEndStation: first ? first.to : destName,
    lifts: j.lifts || [], load: first ? first.load : '', cancelled: tl.some((l) => l.cancelled),
    change: null,
  };
  out.delay = out.planArr ? Math.round((out.arr - out.planArr) / 60000) : 0;
  if (second && first) {
    const walkLeg = j.legs.find((l) => l.walk && l.dep >= first.arr - 1000 && l.arr <= second.dep + 1000);
    out.change = {
      station: first.to, line: second.line, dir: second.dir, platform: second.depPlatform, arrPlatform: first.arrPlatform,
      arr: first.arr, dep: second.dep, planDep: second.planDep, delay: second.delay, cancelled: second.cancelled,
      margin: second.dep - first.arr, walkMin: walkLeg ? Math.max(1, Math.round((walkLeg.arr - walkLeg.dep) / 60000)) : 0,
      load: second.load,
    };
  }
  return out;
}

/* trains after the change: the one you can reach and the one after it, plus a check of the connection */
export async function fetchChange(change) {
  const rows = await board(change.station, 'departures', { results: 16, duration: 60 });
  const same = pickTrains(rows, change.line, change.dir).filter((x) => !x.cancelled);
  const reach = same.filter((x) => x.when >= change.arr + MIN_TRANSFER);
  const mine = reach[0] || null, then = reach[1] || null;
  const margin = mine ? mine.when - change.arr : -1;
  // the planned connection is gone when our own train would arrive too late for it
  const status = change.cancelled || !mine ? 'missed' : change.margin < MIN_TRANSFER + 30000 ? 'tight' : 'ok';
  return { mine, then, status, margin, alt: status === 'ok' ? null : mine || null };
}

/* fallback when there is no live answer: timetable estimate from the route itself */
export function estimate(route, li, stopsLeft) {
  const lg = route.legs[li], per = lg.rideMin / Math.max(1, lg.stops);
  return { at: Date.now(), est: true, legEnd: Date.now() + stopsLeft * per * 60000 };
}

/* compact words for the notification (no emoji) */
export function summary(t) { return t; }
