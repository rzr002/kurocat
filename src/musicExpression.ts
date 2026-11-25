// The library provides a song-level prior. Local lyric evidence can change the delivery of a passage.
export type Mood = 'bright' | 'tender' | 'wistful' | 'fierce' | 'calm';
export interface SongCharacter { tags?: string[]; bpm?: number | null }
type Scores = Record<Mood, number>;
const tones: Mood[] = ['bright', 'tender', 'wistful', 'fierce', 'calm'];
const signals: Record<Mood, RegExp> = {
  bright: /欢快|歡快|快乐|快樂|开心|開心|雀跃|雀躍|灿烂|燦爛|欢笑|微笑|笑容|派对|派對|轻快|輕快|愉悦|活泼|甜蜜|蹦迪|跳舞|阳光|陽光|\b(?:joy(?:ful)?|happy|happier|smil(?:e|ing)|celebrat\w*|dance|dancing|sunshine|upbeat)\b|嬉しい|楽しい/gi,
  tender: /温柔|溫柔|浪漫|深情|爱意|愛意|拥抱|擁抱|牵手|牽手|心动|心動|依偎|吻|爱你|愛你|喜欢你|陪你|相拥|心跳|温暖|溫暖|\b(?:tender|romantic|darling|beloved|kiss\w*|embrace|hold me|love you)\b|抱きしめ|恋しい/gi,
  wistful: /伤感|傷感|悲伤|悲傷|忧伤|憂傷|凄美|遗憾|遺憾|孤[独單单獨]|寂寞|想念|思念|眼[泪淚]|淚|泪|心碎|难过|難過|失去|分[手離离]|告别|告別|离开|離開|落空|回不去|想你|哭|\b(?:sad(?:ness)?|melanchol\w*|lonel\w*|tears?|cry(?:ing)?|goodbye|heartbreak|heartbroken|miss you|lost you|without you)\b|さよなら|寂しい|悲しい/gi,
  fierce: /热血|熱血|激昂|燃烧|燃燒|呐喊|吶喊|嘶吼|怒吼|咆哮|爆发|爆發|不服|冲破|衝破|战斗|戰鬥|逆风|逆風|奋战|抗争|永不退|力量金属|硬摇滚|重金属|朋克|\b(?:fight(?:ing)?|rage|roar|shout|furious|defiant|power metal|hard rock|punk|metalcore)\b|叫べ|戦え/gi,
  calm: /宁静|寧靜|平静|平靜|安静|安靜|静谧|靜謐|舒缓|舒緩|放松|放鬆|治愈|療癒|晚安|轻轻|輕輕|摇篮|搖籃|冥想|氛围|\b(?:calm|peaceful|gentle|quiet|lullaby|sleep|ambient|chill(?:out)?|lo-fi)\b|静かな|おやすみ/gi,
};
function score(text: string): Scores {
  const clean = text.replace(/(?:不再|不必|别再)(?:难过|哭泣|悲伤)|\b(?:not sad|no more tears)\b/gi, '');
  const result: Scores = { bright: 0, tender: 0, wistful: 0, fierce: 0, calm: 0 };
  for (const mood of tones) result[mood] = Math.min(3, new Set(clean.match(signals[mood])?.map(s => s.toLowerCase())).size);
  return result;
}

export function scorePassages(title: string, lines: string[], tags: string[]): { overall: Mood; passages: Mood[] } {
  const tagged = score(tags.join(' ')), named = score(title);
  const phrases = lines.map(score);
  const unique = new Map(lines.map((line,i) => [line, phrases[i]]));
  const base = { ...named };
  for (const mood of tones) {
    let evidence = 0;
    for (const line of unique.values()) evidence += line[mood];
    base[mood] = 2.7 * tagged[mood] + .85 * named[mood] + Math.min(3, evidence / Math.sqrt(unique.size || 1) * 1.8);
  }
  const choose = (values: Scores, fallback: Mood) => tones.reduce((best, m) => values[m] > values[best] ? m : best, fallback);
  const overall = choose(base, 'calm');
  const passages = phrases.map((line, i) => {
    const local = { ...base };
    for (const m of tones) local[m] += 1.7 * line[m] + .75 * ((phrases[i-1]?.[m] || 0) + (phrases[i+1]?.[m] || 0));
    return choose(local, overall);
  });
  return { overall, passages };
}

type Eye = 'smile' | 'open' | 'soft' | 'downcast' | 'focused' | 'closed' | 'wink';
type Motion = 'sway' | 'nod' | 'tilt' | 'bounce' | 'lift';
interface Delivery { eye: Eye; move: Motion }
const deliveries: Record<Mood, Delivery[]> = {
  bright: [{eye:'smile',move:'bounce'}, {eye:'wink',move:'tilt'}, {eye:'open',move:'nod'}],
  tender: [{eye:'soft',move:'tilt'}, {eye:'smile',move:'sway'}, {eye:'closed',move:'lift'}],
  wistful: [{eye:'downcast',move:'nod'}, {eye:'soft',move:'sway'}, {eye:'closed',move:'tilt'}],
  fierce: [{eye:'focused',move:'nod'}, {eye:'closed',move:'lift'}, {eye:'open',move:'bounce'}],
  calm: [{eye:'soft',move:'sway'}, {eye:'closed',move:'nod'}, {eye:'smile',move:'tilt'}],
};
const style = {
  // Pace in the absence of BPM, movement amplitude, ear posture, blush, mouth width and height.
  bright: { tempo: 116, power: .88, ears: .16, blush: .66, width: 1.16, height: .96 },
  tender: { tempo: 78, power: .52, ears: -.05, blush: .78, width: .86, height: .78 },
  wistful: { tempo: 72, power: .48, ears: -.34, blush: .12, width: .79, height: .85 },
  fierce: { tempo: 132, power: 1.0, ears: .25, blush: .26, width: 1.12, height: 1.25 },
  calm: { tempo: 82, power: .43, ears: .01, blush: .36, width: .88, height: .72 },
};

export interface SingingPose {
  mood: Mood; eye: Eye; roll: number; nod: number; sway: number; ear: number; flick: number;
  blush: number; mouthWidth: number; mouthHeight: number; tear: number; side: number; vocal: boolean;
}
export const restingPose: SingingPose = {
  mood:'calm', eye:'open', roll:0, nod:0, sway:0, ear:0, flick:0, blush:0,
  mouthWidth:1, mouthHeight:1, tear:0, side:1, vocal:false,
};

export function singingPose(mood: Mood, variant: number, seconds: number, age: number, bpm: number | null, vocal: boolean): SingingPose {
  const s = style[mood];
  const beat = seconds * (bpm || s.tempo) / 60 * Math.PI * 2;
  const side = variant % 2 ? -1 : 1;
  const { eye, move } = deliveries[mood][variant % 3];
  const wave = Math.sin(beat / 4), pulse = (1 - Math.cos(beat)) / 2;
  const swell = (1 - Math.cos(Math.min(1, age / .48) * Math.PI)) / 2;
  if (!vocal) return { ...restingPose, mood, eye:'soft', side, roll:.052 * wave, sway:.15 * wave,
    ear:.04, flick:.075 * Math.pow(pulse, 6), nod:.13 * Math.sin(beat / 2) };
  const power = s.power * (.62 + .38 * swell);
  let roll = .05 * wave, nod = .08 * pulse, sway = .18 * wave;
  switch (move) {
    case 'bounce': nod = .96 * pulse - .38; sway = .7 * Math.sin(beat / 2); break;
    case 'tilt': roll = side * (.20 + .08 * wave) * swell; nod = .14 * pulse; break;
    case 'nod': nod = .83 * Math.sin(beat / 2) + (mood==='wistful' ? .48 : .06); break;
    case 'lift': nod = -.92 * swell + .14 * wave; roll = .11 * side * swell; break;
    case 'sway': roll = .23 * wave; sway = .94 * wave; break;
  }
  return { mood, eye:eye==='wink' && (age < .25 || age > 1.25) ? 'smile' : eye,
    roll:roll * power, nod:nod * power, sway:sway * power, side, ear:s.ears,
    flick:.22 * power * Math.pow(pulse, 5), blush:s.blush, mouthWidth:s.width,
    mouthHeight:s.height * (move==='lift' ? 1.16 : 1), vocal:true,
    tear:mood==='wistful' && eye==='downcast' ? swell * (.65 + .35 * Math.sin(beat / 8)) : 0 };
}

export function eyeForSide(pose: SingingPose, side: number): Exclude<Eye,'wink'> {
  return pose.eye === 'wink' ? (pose.side === side ? 'smile' : 'open') : pose.eye;
}
