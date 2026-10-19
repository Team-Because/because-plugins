// node tools/mux.mjs <silent.mp4> [--sfx out/sfx.wav] [--music track.mp3] [--music-gain -8] [--out out/final.mp4]
// Puts sound under the picture: mixes SFX and/or a music track, cuts to the video length, and normalises to
// -14 LUFS with a true peak at or under -1 dB (measure, gain, limit, re-measure). Video is copied, not re-encoded.
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { rmSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const video = args.find((a) => a.endsWith('.mp4') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const sfx = opt('sfx'), music = opt('music'), mg = +opt('music-gain', -8);
if (!video || (!sfx && !music)) { console.error('usage: node tools/mux.mjs <silent.mp4> [--sfx a.wav] [--music b.mp3] [--out final.mp4]'); process.exit(1); }
const out = resolve(opt('out', join(dirname(resolve(video)), 'final.mp4')));
const run = (a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...a], { encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(1); } return r.stderr; };
const dur = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout;

const inputs = ['-i', video], parts = [];
if (music) { inputs.push('-i', music); parts.push(`[${inputs.length / 2 - 1}:a]volume=${mg}dB[m]`); }
if (sfx) { inputs.push('-i', sfx); parts.push(`[${inputs.length / 2 - 1}:a]anull[s]`); }
const labels = [music && '[m]', sfx && '[s]'].filter(Boolean);
const mix = labels.length > 1 ? `${labels.join('')}amix=inputs=2:normalize=0[mx]` : `${labels[0]}anull[mx]`;
// apad: a track shorter than the picture is padded with silence, never allowed to cut the video short (-shortest below)
const pre = `${parts.join(';')};${mix};[mx]apad=whole_dur=${dur},atrim=0:${dur},afade=t=out:st=${Math.max(0, dur - 0.3)}:d=0.3`;

// Loudness: measure, apply the missing gain, limit peaks to -2.5 dB at 4x oversampling (true-peak margin), measure again.
// loudnorm alone stops short on sparse SFX: their peaks hit the -1 dB limit long before the level reaches -14 LUFS.
const measure = (f) => { const l = run([...f, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  return [+l.match(/I:\s+(-?[\d.]+) LUFS/g).pop().split(/\s+/)[1], +l.match(/Peak:\s+(-?[\d.]+) dBFS/g).pop().split(/\s+/)[1]]; };
const tmp = out.replace(/\.mp4$/, '.mix.wav');
run(['-y', ...inputs, '-filter_complex', `${pre},aresample=48000[a]`, '-map', '[a]', tmp]);
let gain = 0, I, TP;
for (let i = 0; i < 4; i++) {
  const chain = `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=0.75:level=false:attack=1:release=50,aresample=48000`;  // 4x oversampled, -2.5 dB: catches inter-sample peaks and AAC overshoot
  run(['-y', '-i', tmp, '-af', chain, tmp + '.wav']);
  [I, TP] = measure(['-i', tmp + '.wav']);
  if (Math.abs(I + 14) <= 0.5) break;
  gain += -14 - I;
}
run(['-y', '-i', video, '-i', tmp + '.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  '-shortest', '-movflags', '+faststart', out]);
rmSync(tmp); rmSync(tmp + '.wav');

// Check what actually landed in the AAC file (encoding can move the level and peaks slightly)
const [fI, fTP] = measure(['-i', out]);
const ok = Math.abs(fI + 14) <= 1 && fTP <= -1;
console.log(`${out}\nloudness ${fI} LUFS (target -14), true peak ${fTP} dBFS (limit -1)${ok ? '' : '  WARNING: off target'}`);
if (!ok) process.exitCode = 2;
