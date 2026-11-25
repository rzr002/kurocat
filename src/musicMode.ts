export interface Playback {
  playing?: boolean;
  needsAccess?: boolean;
  title: string;
  artist: string;
  duration: number;
  position: number;
}

interface Cue { start: number; end?: number; text: string; words?: { start: number; end: number }[] }
export interface LyricsResponse { lrc?: string; yrc?: string; instrumental?: boolean }

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

export class MusicPerformance {
  active = false;
  private track = '';
  private position = 0;
  private sampledAt = 0;
  private secondsRead = -1;
  private cues: Cue[] = [];
  private instrumental = false;
  private title = '';
  private duration = 0;

  update(p: Playback | null, now: number): string {
    const key = p?.playing ? JSON.stringify([p.title, p.artist, p.duration]) : '';
    if (key !== this.track) {
      this.track = key;
      this.cues = [];
      this.instrumental = false;
      this.secondsRead = -1;
    }
    this.active = Boolean(key);
    if (this.active && p) {
      this.title = p.title;
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
    this.cues = parseLyrics(lyrics);
    this.instrumental = Boolean(lyrics.instrumental) || this.cues.some(c => /^纯音乐[，, ]*请欣赏[。！! ]*$/.test(c.text));
  }

  frame(now: number): { caption: string; mouth: number } {
    if (!this.active) return { caption: '', mouth: 0 };
    const t = Math.min(this.duration, this.position + Math.min(1.25, Math.max(0, now - this.sampledAt) / 1000));
    if (this.instrumental) return { caption: this.title + ' · 纯音乐', mouth: 0 };
    let lo = 0, hi = this.cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cues[mid].start <= t) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1;
    const cue = this.cues[i];
    const credit = cue && /^(?:作\s*[词詞曲]|[编編]曲|制作人|混音|录音|母带|lyrics by|composed by)\s*[:：]/i.test(cue.text);
    if (this.cues.length && (!cue?.text || credit || t >= (cue.end ?? (this.cues[i + 1]?.start ?? this.duration)))) {
      return { caption: '♫ ' + this.title, mouth: 0 };
    }
    const word = cue?.words?.find(w => w.start <= t && t < w.end);
    const phase = word ? (t - word.start) / Math.max(0.08, word.end - word.start) : (t - (cue?.start ?? 0)) * 2.9;
    const mouth = cue?.words && !word ? 0 : 0.13 + 0.87 * Math.abs(Math.sin(Math.PI * phase));
    return { caption: cue?.text || '♫ ' + this.title, mouth };
  }
}
