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
  assert.equal(cat.frame(500).caption, '');
  cat.update({ ...playback, position: 1 }, 600);
  assert.equal(cat.frame(600).caption, '第一句');
  const second = cat.update({ ...playback, title: '新曲' }, 700);
  cat.load(key, { lrc: '[00:00]过期' });
  assert.equal(cat.frame(700).caption, '');
  cat.load(second, { instrumental: true });
  assert.equal(cat.frame(800).mouth, 0);
  cat.update(null, 900);
  assert.equal(cat.frame(900).caption, '');
  assert.equal(cat.frame(900).pose.vocal, false);
  assert.equal(cat.active, false);
});

test('前奏、署名、逐字间奏、尾奏、无歌词和纯音乐均不显示歌名', () => {
  const cat = new MusicPerformance();
  const sample = { ...playback, title:'真实', position:0 };
  const key = cat.update(sample,0);
  const at = position => { cat.update({...sample, position},0); return cat.frame(0); };
  assert.equal(at(0).caption, '');
  cat.load(key, { yrc:'[0,2000](0,1900,0)真实\n[2000,1800](2000,1800,0)作词：测试\n[10000,8000](11000,1000,0)向前(15500,1000,0)走' });
  for (const t of [0,2.3,6,10.2,13,17,22]) {
    const frame=at(t);
    assert.equal(frame.caption,''); assert.equal(frame.mouth,0); assert.equal(frame.pose.vocal,false);
  }
  assert.equal(at(11.3).caption,'向前走');
  assert.equal(at(15.7).caption,'向前走');
  cat.load(key,{lrc:'[00:00]真实 - 测试\n[00:03]曲：测试\n[00:10]唱一句\n[00:40]再唱一句'});
  assert.equal(at(10.5).caption,'唱一句');
  for (const t of [0,3,23,69]) assert.equal(at(t).caption,'');
  cat.load(key,{instrumental:true,lrc:'[00:00]一段文字'});
  assert.equal(at(1).caption,'');
});
test('曲库标签和本地歌词可分别提供情绪，乐段能转变，同一情绪有多种演法', () => {
  const cat=new MusicPerformance();
  const key=cat.update(playback,0);
  const at=t=>{cat.update({...playback,position:t},0); return cat.frame(0);};
  cat.load(key,{lrc:'[00:01]这一句\n[00:05]下一句\n[00:09]再一句'});
  for (const [tag,mood] of [['欢快','bright'],['浪漫','tender'],['伤感','wistful'],['热血','fierce'],['宁静','calm']]) {
    cat.setCharacter(key,{tags:[tag],bpm:102});
    const poses=[1.6,5.6,9.6].map(t=>at(t).pose);
    assert.ok(poses.every(p=>p.mood===mood && p.vocal));
    assert.equal(new Set(poses.map(p=>p.eye)).size,3);
    assert.deepEqual(at(5.6).pose,poses[1]);
  }
  cat.load(key,{lrc:'[00:01]心碎的孤独和眼泪\n[00:06]孤独地告别\n[00:11]冲破黑夜怒吼着战斗\n[00:16]燃烧不服的力量'});
  assert.equal(at(1.4).pose.mood,'wistful');
  assert.equal(at(11.4).pose.mood,'fierce');
  cat.setCharacter('上一首',{tags:['宁静']});
  assert.equal(at(11.4).pose.mood,'fierce');
});
