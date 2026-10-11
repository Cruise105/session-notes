// Diseases (Giffyglyph's Darker Dungeons v4, chapter 30) and survival conditions (chapter 31).
// Darker Dungeons is third-party: it isn't one of your WotC sourcebooks, so it's labeled as its own source.
import { DAY } from './calendar.js';

const DD = 'Darker Dungeons';
const D = (id, name, rarity, dc, incDays, transmission, description, stages, cured) =>
  ({ id: 'dis-' + id, name, rarity, dc, incubation: incDays, transmission, description, stages, cured, source: DD, seed: true });

export const SEED_DISEASES = [
  D('bubonic-plague', 'Bubonic Plague', 'Rare', 25, 1, 'Touch', 'Often mistaken for influenza at first, swollen buboes mark the body and a near-certain death sentence.', [
    'Your body aches and you have a slight fever. You have -2 to all ability modifiers.',
    'Painful buboes appear around your arm, groin, and neck. You have disadvantage on all rolls.',
    "Your fever burns extremely hot and you can't stop sweating. You fall into a coma.",
    'Your internal organs fail and you die.'], 'Your body is scarred by the buboes.'),
  D('chickenpox', 'Chickenpox', 'Common', 20, 2, 'Touch, Air', 'Tiny, itchy spots that spread across your entire body. Very contagious, but not usually life-threatening.', [
    'You have a slight fever and feel weak. You have -2 STR and -2 DEX.',
    'You have noticeable pox marks across your body. You have disadvantage on social checks.',
    'You are covered in itchy spots. You have disadvantage on concentration checks.',
    'Your fever is burning hot. You have disadvantage on all rolls.'], 'You have a few small scars from the pox. You are permanently immune to chickenpox.'),
  D('cholera', 'Cholera', 'Common', 10, 1, 'Touch (excrement)', "One drink of bad water and you'll be curled up by the toilet for a week—or die from dehydration.", [
    'You feel sick and nauseous, and eating food causes you to vomit. -2 DEX and -2 WIS.',
    'You have diarrhea. -2 STR, -2 CHA, and you gain thirst at twice the normal rate.',
    'You have lost noticeable weight. You are dehydrated and have disadvantage on all rolls.',
    'Your body goes into shock from severe dehydration, and you die.'], "You can't eat rich food for the next week without being sick."),
  D('diphtheria', 'Diphtheria', 'Rare', 15, 3, 'Touch, Air', 'A nasty infection of the throat that can cause permanent scarring if it penetrates the skin.', [
    'You have a sore throat and headache. You have -2 CHA and disadvantage on concentration checks.',
    "You have swollen glands in your neck and it's very painful to swallow. You have -2 STR and -2 DEX.",
    'Large, painful ulcers appear on your skin. You have -2 CON and disadvantage on social checks.',
    'Pus-filled blisters appear on your legs, hands, and feet. You have disadvantage on all rolls.'], 'You have permanent scars from your skin ulcers.'),
  D('dysentery', 'Dysentery', 'Common', 20, 1, 'Touch (excrement)', 'Easy to catch and painful to endure, one sip of dirty water can be enough to ruin your whole week.', [
    'You suffer painful stomach cramps. You have disadvantage on all saving throws.',
    'You have a mighty need to use the restroom. You have -2 to all ability modifiers.',
    "You can't keep any food down. You gain thirst and fatigue at twice the normal rate.",
    'Your body is too weak to stand. Your speed is reduced to 0.'], "You can't eat rich food during the next week without being sick."),
  D('influenza', 'Influenza', 'Common', 10, 2, 'Touch, Air', 'A harmless cough and a slight fever can quickly turn into something much more serious without bed rest.', [
    'You have a bad headache and a runny nose. You have -2 INT, and -2 WIS.',
    'Your entire body aches and your throat is sore. You have -2 STR, -2 DEX, and -2 CHA.',
    "You have a terrible fever and hallucinations. You can't move under your own power.",
    'Your internal organs fail and, after slipping into a coma, you die within a few hours.'], 'You have an annoying cough for one week.'),
  D('smallpox', 'Smallpox', 'Rare', 15, 4, 'Touch, Air', 'Tiny spots that quickly become large, painful blisters across your entire body, leaving you with pox scars.', [
    'You have a slight fever and feel weak. You have -2 STR and -2 DEX.',
    'You have a persistent headache and flat, red spots on your face, hands, and forearms. You have -2 INT, -2 WIS, and -2 CON.',
    'Your spots become large, painful, pus-filled blisters. You have disadvantage on all rolls.',
    'Your fever is extremely hot. You fall into a coma.'], 'You have severe scars from the pox.'),
  D('stonescale', 'Stonescale', 'Mythic', 30, 28, 'Touch', 'As your skin turns grey and cracked, your mind decays to that of a wild animal. Kill them before they kill you.', [
    'The skin around your eyes turns noticeably grey. You have disadvantage on social checks.',
    'Your skin is grey and cracked. Movement is painful. You have -2 to all ability modifiers.',
    'You become very forgetful and increasingly aggressive. You have advantage on all STR rolls, and disadvantage on all INT, WIS, and CHA rolls.',
    'You have lost your mind and become a wild beast.'], 'Your skin is permanently marked with stonescale.'),
  D('syphilis', 'Syphilis', 'Common', 20, 28, 'Touch (sore)', 'The flesh is weak. Let your guard down for one night and you might still be paying for it years later.', [
    'A highly-contagious sore opens near your lips or groin. You have disadvantage on social checks.',
    'A rash appears on your hands and feet, and you have a fever. You have -2 DEX and -2 CON.',
    'More sores appear on your body, and you are easily exhausted. You have -2 STR and gain fatigue at twice the normal rate.',
    'You have lost noticeable weight and your mind is fuzzy. You have -2 INT, -2 WIS, and -2 CHA.'], 'You still carry the disease and can infect others.'),
  D('tapeworm', 'Tapeworm', 'Common', 15, 7, 'Touch (excrement)', 'Tiny parasites that hide away in rotten meat and excrement. Watch what you eat.', [
    'You always seem to be hungry. You gain hunger at twice the normal rate.',
    'You have lost a significant amount of weight. You have -2 CON and -2 STR.',
    'You suffer from terrible headaches and some memory loss. You have -2 INT and -2 WIS.',
    'The parasites have reached your brain. You fall into a coma and die.'], 'You have painful stomach cramps for one week.'),
  D('typhoid-fever', 'Typhoid Fever', 'Common', 15, 7, 'Touch (excrement)', "Sometimes it's better to go thirsty than take a drink of filthy water. Don't risk it—boil it.", [
    'You have a fever, a headache, and frequent nosebleeds. You have -2 to all modifiers.',
    'Red spots appear on your skin and you are easily exhausted. You gain fatigue at twice the rate.',
    'You suffer diarrhea. You gain thirst at twice the rate and have disadvantage to all social checks.',
    "Your fever is burning hot and you are delirious. You can't move or act on your own power."], 'You feel fragile for the next week.'),
  D('whooping-cough', 'Whooping Cough', 'Common', 15, 7, 'Air', "Fits of violent coughing followed by a 'whooping' inhale of breath—and sometimes, broken ribs.", [
    'You have a mild cough and disadvantage on concentration checks.',
    'You cough in loud, uncontrollable fits with a gasping inhale. You have -2 STR and -2 DEX.',
    'Your coughing fits are violent enough to cause vomiting. You have disadvantage on all rolls.',
    "Your cough is so violent you have broken some of your ribs. You have 0 hit dice and can't move without immense pain."], 'You have an annoying cough for the next week.'),
];

export const RARITY_DC = { Common: 10, Rare: 20, Mythic: 30 }; // diagnosis DC
export const CONTAGIOUS = [null, 0.25, 0.5, 0.75, 1]; // below this share of max HP, by stage (stage 4: always)
// Magic Strength: highest disease DC a spell of this level can push into decline.
export const magicMaxDC = level => (level <= 5 ? 15 : level <= 8 ? 25 : 30);
// Magical Immunity: class feature level -> immune up to this DC.
export const immunityDC = level => (level <= 0 ? 0 : level <= 5 ? 15 : level <= 10 ? 20 : level <= 15 ? 25 : 99);

export const incubationMins = d => Math.max(1, +d.incubation || 1) * DAY;
export function fmtIncubation(days) {
  days = +days || 1;
  if (days % 7 === 0) { const w = days / 7; return `${w} week${w > 1 ? 's' : ''}`; }
  return `${days} day${days > 1 ? 's' : ''}`;
}

// Effects are cumulative: stage 3 has the effects of stages 1, 2 and 3.
export function activeEffects(disease, stage) { return (disease?.stages || []).slice(0, Math.max(0, stage)); }

// "gain thirst at twice the normal rate" and the like, from the stages in effect.
export function rateDoubling(disease, stage) {
  const txt = activeEffects(disease, stage).join(' ').toLowerCase();
  const out = { hunger: false, thirst: false, fatigue: false };
  for (const m of txt.matchAll(/gain ([a-z ,and]+?) at twice/g)) {
    for (const k of Object.keys(out)) if (m[1].includes(k)) out[k] = true;
  }
  return out;
}

// ---------- survival conditions
export const CONDITIONS = [
  { id: 'hunger', name: 'Hunger', stages: ['Stuffed', 'Well-fed', 'Ok', 'Peckish', 'Hungry', 'Ravenous', 'Starving'] },
  { id: 'thirst', name: 'Thirst', stages: ['Quenched', 'Refreshed', 'Ok', 'Parched', 'Thirsty', 'Dry', 'Dehydrated'] },
  { id: 'fatigue', name: 'Fatigue', stages: ['Energized', 'Well-rested', 'Ok', 'Tired', 'Sleepy', 'Very sleepy', 'Barely awake'] },
  { id: 'temp', name: 'Temperature', stages: ['Perfect', 'Comfortable', 'Ok', 'Noticeable', 'Uncomfortable', 'Overwhelming', 'Unbearable'] },
];
export const STAMINA_DC = [null, 5, 10, 15, 20, 25, 30];

export function defaultSurvival() {
  return { hunger: 2, thirst: 2, fatigue: 2, exhausting: { hunger: false, thirst: false, fatigue: false, temp: false }, food: 0, water: 0,
    gear: { coldGear: false, coldRes: false, heatRes: false, coldAdapted: false, heatAdapted: false } };
}

// Air temperature at a time of day: coldest around sunrise (5 AM), warmest mid-afternoon (3 PM).
export function tempAt(w, minuteOfDay) {
  const h = minuteOfDay / 60;
  let f;
  if (h >= 5 && h <= 15) f = (1 - Math.cos(Math.PI * (h - 5) / 10)) / 2;
  else { const x = h > 15 ? h - 15 : h + 9; f = (1 + Math.cos(Math.PI * x / 14)) / 2; }
  return w.low + (w.high - w.low) * f;
}

// Temperature stage from the air temperature (homebrew: Darker Dungeons leaves the baseline to the GM).
// Returns { stage, side: 'cold'|'hot'|null }.
export function tempStage(f, gear = {}, sheltered = false, wind = 0) {
  let side = null, stage;
  const felt = f - (wind === 2 ? 10 : wind === 1 ? 4 : 0);
  if (felt >= 66 && felt <= 72) stage = 0;
  else if (felt >= 60 && felt <= 80) stage = 1;
  else if (felt < 60) {
    side = 'cold';
    stage = felt >= 45 ? 2 : felt >= 32 ? 3 : felt >= 10 ? 4 : felt >= -10 ? 5 : 6;
    if (gear.coldGear) stage -= 2;
    if (gear.coldAdapted) stage -= 1;
    if (sheltered) stage -= 3;
    if (gear.coldRes) stage = Math.min(stage, 3);
  } else {
    side = 'hot';
    stage = felt <= 88 ? 2 : felt <= 96 ? 3 : felt <= 104 ? 4 : felt <= 114 ? 5 : 6;
    if (gear.heatAdapted) stage -= 1;
    if (sheltered) stage -= 2;
    if (gear.heatRes) stage = Math.min(stage, 3);
  }
  stage = Math.max(side ? 1 : 0, Math.min(6, stage));
  return { stage, side: stage <= 1 ? null : side };
}

// Clock marks (minutes into the day): dawn 6:00, noon 12:00, dusk 18:00.
export const MARKS = [
  { at: 6 * 60, name: 'dawn', hunger: 1, thirst: 1, fatigue: 0 },
  { at: 12 * 60, name: 'noon', hunger: 0, thirst: 0, fatigue: 1 },
  { at: 18 * 60, name: 'dusk', hunger: 1, thirst: 1, fatigue: 1 },
];
// Every mark passed going from t0 to t1 (forward only), oldest first.
export function marksBetween(t0, t1) {
  const out = [];
  if (t1 <= t0) return out;
  const d0 = Math.floor(t0 / DAY), d1 = Math.floor(t1 / DAY);
  for (let d = d0; d <= d1 && out.length < 400; d++) for (const m of MARKS) { const t = d * DAY + m.at; if (t > t0 && t <= t1) out.push({ ...m, t }); }
  return out;
}
