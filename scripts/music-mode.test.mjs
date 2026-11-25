import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPerformance, parseLyrics } from '../src/musicMode.ts';

const playback = { playing: true, title: '第一首', artist: '测试', duration: 90, position: 2 };
test('逐字时间驱动口型，词间与间奏收口', () => {
  const cat = new MusicPerformance();
  const key = cat.update(playback, 0);
  cat.load(key, { yrc: '[1000,3000](1000,1500,0)你(2800,800,0)好' });
  assert.equal(cat.frame(0).caption, '你好');
  assert.ok(cat.frame(0).mouth > 0.2);
  assert.equal(cat.frame(600).mouth, 0);
  cat.update({ ...playback, position: 20 }, 1000);
  assert.equal(cat.frame(1000).mouth, 0);
});
test('逐行歌词支持偏移、重复时间戳和空白行', () => {
  const result = parseLyrics({ lrc: '[offset:200]\n[00:01.20][00:05.20]重复\n[00:08.20]' });
  assert.deepEqual(result.map(c => [Math.round(c.start * 1000), c.text]), [[1000, '重复'], [5000, '重复'], [8000, '']]);
});
test('跳播、暂停和切歌期间迟到的歌词响应', () => {
  const cat = new MusicPerformance();
  const key = cat.update(playback, 0);
  cat.load(key, { lrc: '[00:00]第一句\n[00:10]第二句' });
  cat.update({ ...playback, position: 15 }, 500);
  assert.equal(cat.frame(500).caption, '第二句');
  cat.update({ ...playback, position: 3 }, 600);
  assert.equal(cat.frame(600).caption, '第一句');
  const second = cat.update({ ...playback, title: '新曲' }, 700);
  cat.load(key, { lrc: '[00:00]过期' });
  assert.equal(cat.frame(700).caption, '♫ 新曲');
  cat.load(second, { instrumental: true });
  assert.equal(cat.frame(800).mouth, 0);
  cat.update(null, 900);
  assert.deepEqual(cat.frame(900), { caption: '', mouth: 0 });
  assert.equal(cat.active, false);
});
