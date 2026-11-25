/* Voice and typed commands. Rule based, no cloud AI and no key inside the app.
 * parseIntent(text) -> { type, from, to, place, page, theme } where from/to/place are plain text (or 'home' / 'work' tokens).
 * Understands full sentences in English and German, plus the short forms of the other app languages.
 *   "I want to go to Alexanderplatz"       "from home to Westkreuz"       "take me home"
 *   "how do I get to the main station"      "Ich möchte nach Alexanderplatz"  "von zu Hause zum Hauptbahnhof"
 *   "departures at Ostkreuz"                "open the map"                 "dark mode"                */

const FILLER = [
  /\b(hey|hi|hello|ok|okay)\s+(bearline|bear|claude|google)\b/g, /\b(please|bitte|kindly|thanks|thank you|danke)\b/g,
  /\b(can|could|would|will)\s+you\b/g, /\b(i|we)\s+(would|'d)\s+like\s+to\b/g, /\bi'?d\s+like\s+to\b/g, /\b(i|we)\s+(want|wanna|need|have|got)\s+to\b/g, /\bi\s+am\s+going\s+to\b/g, /\bi'?m\s+going\s+to\b/g,
  /\bich\s+(möchte|moechte|will|muss|würde\s+gerne|wuerde\s+gerne|will\s+gerne)\b/g, /\bwir\s+(möchten|wollen|müssen)\b/g,
  /\b(tell\s+me|show\s+me|zeig\s+mir|sag\s+mir)\b/g,
];
const HOME = /^(?:my\s+)?(?:home|house|place)$|^(?:zu\s+)?(?:hause?|heim|meine[rm]?\s+wohnung|meiner\s+wohnung|wohnung|zuhause)$/;
const WORK = /^(?:my\s+)?(?:work|office|job|workplace)$|^(?:the\s+)?office$|^(?:zur\s+|zu\s+meiner\s+)?(?:arbeit|büro|buero|arbeitsplatz)$/;

export function clean(t) {
  let s = String(t || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  FILLER.forEach((r) => { s = s.replace(r, ' '); });
  return s.replace(/\s+/g, ' ').trim();
}
const stripArt = (x) => x.replace(/^(the|der|die|das|dem|den|zum|zur|zu\s+dem|zu\s+der|nach|to|at|in|im|am)\s+/, '').replace(/\s+(please|bitte)$/, '').trim();
export function special(x) {
  const s = stripArt(String(x || '').trim());
  if (HOME.test(s) || HOME.test(String(x).trim())) return 'home';
  if (WORK.test(s) || WORK.test(String(x).trim())) return 'work';
  return null;
}
const tidy = (x) => { const s = stripArt(String(x || '').trim()); return special(s) || s; };

const GO = '(?:go|get|travel|ride|drive|head|navigate|route|directions?|take\\s+me|bring\\s+me|bring\\s+mich|fahr(?:e|en)?(?:\\s+mich)?|fahr\\s+mich|navigier(?:e|en)?|route|wie\\s+komme\\s+ich|wo\\s+geht\\s+es|ich\\s+komme)';

export function parseIntent(text) {
  const raw = String(text || '').trim(); const t = clean(raw);
  if (!t) return { type: 'none' };
  let m;
  // app commands
  if (/\b(dark\s*mode|night\s*mode|dunkel(?:modus)?|dunklen\s*modus)\b/.test(t)) return { type: 'theme', theme: 'dark' };
  if (/\b(light\s*mode|day\s*mode|hell(?:modus)?|hellen\s*modus)\b/.test(t)) return { type: 'theme', theme: 'light' };
  if ((m = t.match(/^(?:open|go\s+to|show|öffne|zeige?|zeig)\s+(?:the\s+|die\s+|den\s+|das\s+)?(map|karte|navigat\w*|nearby|in\s+der\s+nähe|settings|einstellungen|more|mehr)$/))) {
    const k = m[1]; const page = /^(map|karte)/.test(k) ? 'pMap' : /^nav/.test(k) ? 'pNav' : /nearby|nähe/.test(k) ? 'pNear' : 'pMore';
    return { type: 'page', page };
  }
  if (/^(?:start|begin|starte|los)\s*(?:the\s+)?(?:navigation|route|navigation)?$/.test(t)) return { type: 'start' };
  // departures
  if ((m = t.match(/(?:next\s+(?:trains?|buses|bus|tram|departures?)|departures?|arrivals?|abfahrten?|ankünfte|nächste[rn]?\s+(?:zug|züge|bus|bahn|abfahrt))\s*(?:at|from|in|am|ab|an|für|for|of|vom)?\s*(.*)$/))) return { type: 'departures', place: tidy(m[1]) || null };
  if ((m = t.match(/^when\s+(?:does|is|do)\s+the\s+next\s+\w+\s+(?:leave|depart|come)\s+(?:from|at)\s+(.+)$/))) return { type: 'departures', place: tidy(m[1]) };
  if ((m = t.match(/^wann\s+fährt\s+(?:der|die|das)\s+nächste\w*\s+(?:\w+\s+)?(?:ab\s+)?(?:von|ab|an|am)\s+(.+)$/))) return { type: 'departures', place: tidy(m[1]) };
  // from A to B (also "wie komme ich von A nach B", "von A zu B", "A to B")
  m = t.match(/(?:\bfrom|\bvon|\bab|\bdesde|\bda|\bde|\bde\s+la|से|ਤੋਂ|从|從)\s+(.+?)\s+(?:to|nach|zu|zum|zur|bis(?:\s+zum|\s+zur)?|\ba\b|à|al|verso|vers|तक|को|ਤੱਕ|到|去)\s+(.+)$/);
  if (m) return { type: 'route', from: tidy(m[1]), to: tidy(m[2]) };
  // "to B from A"
  m = t.match(/(?:to|nach|zu|zum|zur)\s+(.+?)\s+(?:from|von|ab)\s+(.+)$/);
  if (m && /(go|get|navigate|route|take|bring|fahr|komm)/.test(t)) return { type: 'route', from: tidy(m[2]), to: tidy(m[1]) };
  // take me home / bring mich nach hause / go home
  if ((m = t.match(/^(?:go|take\s+me|bring\s+me|bring\s+mich|navigate|fahr\s+mich|fahre?|navigiere?|route)\s+(?:to\s+)?(home|work|office|hause?|zuhause|nach\s+hause|zur\s+arbeit|zum\s+büro|ins\s+büro|arbeit)$/))) return { type: 'route', to: special(m[1]) || tidy(m[1]) };
  // going somewhere: GO verb ... to X / "I want to go to X" (after the filler is gone: "go to X")
  m = t.match(new RegExp('(?:' + GO + '|wohin|how\\s+do\\s+i\\s+get|how\\s+to\\s+get|how\\s+can\\s+i\\s+get|where\\s+is|wo\\s+ist)\\s*(?:\\w+\\s+)?(?:to|nach|zu|zum|zur|ins|in\\s+die|in\\s+den|an\\s+den|an\\s+die)\\s+(.+)$'));
  if (m) return { type: 'route', to: tidy(m[1]) };
  // "navigate X", "route to X"
  m = t.match(new RegExp('^(?:' + GO + ')\\s+(.+)$'));
  if (m && !/^(me|mich)$/.test(m[1])) return { type: 'route', to: tidy(m[1].replace(/^(to|nach|zu|zum|zur)\s+/, '')) };
  // "to X", "nach X", "zum X"
  m = t.match(/^(?:navigate\s+to|go\s+to|bring\s+mich\s+zu|to|nach|zum|zur|zu)\s+(.+)$|^(?:去|到|前往|往)\s*(.+)$/); if (m) m[1] = m[1] || m[2];
  if (m) return { type: 'route', to: tidy(m[1]) };
  m = t.match(/(.+?)\s*(?:으로|로|에)\s*(?:가|갈)/); if (m) return { type: 'route', to: tidy(m[1]) };
  // bare "A to B" / "A nach B"
  m = t.match(/^(.+?)\s+(?:to|nach)\s+(.+)$/);
  if (m) return { type: 'route', from: tidy(m[1]), to: tidy(m[2]) };
  // just a place name (or home / work)
  const only = tidy(t.replace(/(जाना|जाओ|ਜਾਣਾ|ਜਾਓ)$/u, ''));
  return only ? { type: 'route', to: only } : { type: 'none' };
}
