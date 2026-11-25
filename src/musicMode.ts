import { scorePassages, singingPose, restingPose, type Mood, type SongCharacter, type SingingPose } from './musicExpression.ts';

export interface Playback {
  playing?: boolean;
  needsAccess?: boolean;
  title: string;
  artist: string;
  duration: number;
  position: number;
}

interface Cue { start: number; end?: number; text: string; words?: { start: number; end: number }[] }
export interface LyricsResponse { lrc?: string; yrc?: string; instrumental?: boolean; songId?: number; character?: SongCharacter }

export function parseLyrics(data: LyricsResponse): Cue[] {
  const timed: Cue[] = [];
  for (const line of (data.yrc || '').split(/\r?\n/)) {
    const stamp = /^\[(\d+),(\d+)\](.*)$/.exec(line);
    if (!stamp) continue;
    const words = [...stamp[3].matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g)];
    const text = words.map(w => w[3]).join('').trim();
    if (!text) continue;
    timed.push({ start: +stamp[1] / 1000, end: (+stamp[1] + +stamp[2]) / 1000, text,
      words: words.filter(w => w[3].trim()).map(w => ({ start: +w[1] / 1000, end: (+w[1] + +w[2]) / 1000 })) });
  }
  if (timed.length) return timed.sort((a, b) => a.start - b.start);
  const lrc = data.lrc || '';
  const offset = Number(/\[offset:([+-]?\d+)\]/i.exec(lrc)?.[1] || 0) / 1000;
  for (const line of lrc.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{2}(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = line.slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length).trim();
    for (const [, m, s] of stamps) timed.push({ start: +m * 60 + Number(s.replace(':', '.')) - offset, text });
  }
  return timed.sort((a, b) => a.start - b.start);
}

interface PerformanceFrame { caption: string; mouth: number; pose: SingingPose }
interface Phrase extends Cue { lyric: string; until: number }

function singableText(text: string, title: string, artist: string, opening: boolean): string {
  if (/^(?:(?:作\s*)?[词詞曲]|[编編]曲|[词詞]曲|制作(?:人|团队)?|製作人|作[詞词]人|混音|录音|母带|出品(?:人)?|演唱|歌手|原唱|和声|监制|发行|吉他|贝斯|lyrics(?: by)?|compos(?:ed by|er)|written by|prod(?:uced)? by|arrang(?:ed by|er))\s*[:：]/i.test(text)) return '';
  if (/^[\s♪♫♬~～·…—.\-]*$/.test(text) || /^(?:\[|【|\(|（)?\s*(?:前奏|间奏|間奏|尾奏|纯音乐.*|純音樂.*|伴奏|instrumental|intro|outro|interlude|chorus|verse\s*\d*|bridge|solo)\s*(?:\]|】|\)|）)?$/i.test(text)) return '';
  if (opening) {
    const norm = (v: string) => v.toLowerCase().replace(/[\s·•—–\-:：]/g,'');
    const line = norm(text), song = norm(title), performer = norm(artist);
    if ([song, performer, song + performer, performer + song].includes(line)) return '';
  }
  return text;
}

function estimatedVocalLength(text: string): number {
  const units = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  const words = (text.match(/[\p{Script=Latin}\p{Script=Cyrillic}]+/gu) || []).length;
  return Math.min(9, Math.max(2.3, 1.15 + units * .42 + words * .48));
}

export class MusicPerformance {
  active = false;
  private track = '';
  private position = 0;
  private sampledAt = 0;
  private secondsRead = -1;
  private cues: Phrase[] = [];
  private instrumental = false;
  private title = '';
  private artist = '';
  private duration = 0;
  private overall: Mood = 'calm';
  private passages: Mood[] = [];
  private bpm: number | null = null;
  private seed = 0;

  update(p: Playback | null, now: number): string {
    const key = p?.playing ? JSON.stringify([p.title, p.artist, p.duration]) : '';
    if (key !== this.track) {
      this.track = key;
      this.cues = [];
      this.instrumental = false;
      this.secondsRead = -1;
      this.title = p?.title || '';
      this.artist = p?.artist || '';
      this.seed = Array.from(key).reduce((n,c) => (Math.imul(n,31) + c.charCodeAt(0)) >>> 0, 0) % 6;
      this.setCharacter(key, {});
    }
    this.active = Boolean(key);
    if (this.active && p) {
      this.duration = p.duration;
      if (p.position !== this.secondsRead) {
        this.position = p.position;
        this.secondsRead = p.position;
        this.sampledAt = now;
      }
    }
    return key;
  }

  load(key: string, lyrics: LyricsResponse): void {
    if (!key || this.track !== key) return;
    const raw = parseLyrics(lyrics);
    this.instrumental = Boolean(lyrics.instrumental) || raw.some(c => /^[纯純][音][乐樂][，, ]*[请請]欣[赏賞][。！! ]*$/.test(c.text));
    this.cues = raw.map((cue, i) => {
      const lyric = singableText(cue.text, this.title, this.artist, i < 3 && cue.start < 20);
      const next = raw[i+1]?.start ?? this.duration;
      // LRC marks line starts only. Retire the previous lyric during long gaps.
      const estimated = estimatedVocalLength(lyric);
      const until = cue.end ?? (next - cue.start <= estimated + 1.5 ? next : cue.start + estimated);
      return { ...cue, lyric, until: Math.min(until, next) };
    });
    this.setCharacter(key, lyrics.character || {});
  }

  setCharacter(key: string, character: SongCharacter): void {
    if (key !== this.track) return;
    const scoring = scorePassages(this.title, this.cues.map(c => c.lyric), character.tags || []);
    this.overall = scoring.overall;
    this.passages = scoring.passages;
    this.bpm = character.bpm && character.bpm >= 35 && character.bpm <= 240 ? character.bpm : null;
  }

  frame(now: number): PerformanceFrame {
    if (!this.active) return { caption:'', mouth:0, pose:restingPose };
    const t = Math.min(this.duration, this.position + Math.min(1.25, Math.max(0, now - this.sampledAt) / 1000));
    let lo = 0, hi = this.cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cues[mid].start <= t) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1, cue = this.cues[i];
    const words = cue?.words;
    const wordIndex = words?.findIndex(w => w.end > t) ?? -1;
    const nextWord = words?.[wordIndex];
    const longRest = !!words?.length && (!nextWord || (t < nextWord.start &&
      (wordIndex === 0 || nextWord.start - words[wordIndex-1].end > 1.5)));
    if (this.instrumental || !cue?.lyric || t >= cue.until || longRest) {
      return { caption:'', mouth:0, pose:singingPose(this.overall, this.seed, t, 0, this.bpm, false) };
    }
    const word = nextWord && nextWord.start <= t ? nextWord : null;
    const elapsed = t - cue.start;
    const phase = word ? (t - word.start) / Math.max(.08, word.end - word.start) : elapsed * 2.9;
    const mouth = words && !word ? 0 : .13 + .87 * Math.abs(Math.sin(Math.PI * phase));
    const slot = Math.floor(elapsed / 4.2);
    return { caption:cue.lyric, mouth, pose:singingPose(this.passages[i] || this.overall,
      this.seed + i + slot, t, elapsed - slot * 4.2, this.bpm, true) };
  }
}
