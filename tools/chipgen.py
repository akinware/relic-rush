#!/usr/bin/env python3
"""Relic Rush in-run music: four original chip-disco tracks (pulse leads, NES-style triangle, noise drums,
four-on-the-floor kicks), one per zone, rising in tempo and tension. Written note by note below and rendered
with numpy, so the music is ours (no licence strings attached).

    python3 tools/chipgen.py            # writes music-sunrise/canopy/ember/moon.ogg (needs ffmpeg)
    python3 tools/chipgen.py --wav      # also keeps the .wav files

Each file loops seamlessly: echoes and release tails that run past the end are wrapped onto the start.
"""
import subprocess, sys, numpy as np
from scipy.signal import lfilter

SR = 44100
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- instruments
def env(n, a=0.002, d=0.08, s=0.6, r=0.03, hold=None):
    """attack / decay / sustain for `hold` samples, then release."""
    hold = n if hold is None else hold
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip(1 - (np.arange(n) - hold) / max(1, r * SR), 0, 1)
    return e * np.where(np.arange(n) < hold, 1, rel)

def pulse(freq, n, duty=0.25, vib=0.0, vib_delay=0.12, slide_from=None):
    t = np.arange(n) / SR
    f = np.full(n, freq, float)
    if slide_from:
        k = np.clip(t / 0.05, 0, 1); f = slide_from + (freq - slide_from) * k
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - vib_delay) / 0.1, 0, 1))
    ph = np.cumsum(f) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)

def tri(freq, n):
    ph = (np.cumsum(np.full(n, freq)) / SR) % 1
    w = 4 * np.abs(ph - 0.5) - 1
    return np.round(w * 7.5) / 7.5            # 4-bit steps like the NES triangle channel

def noise(n, rate=SR):
    hold = max(1, int(SR / rate))
    v = rng.choice([-1.0, 1.0], size=n // hold + 2)
    return np.repeat(v, hold)[:n]

def kick(n):
    t = np.arange(n) / SR
    f = 45 + 200 * np.exp(-t / 0.028)
    ph = np.cumsum(f) / SR
    body = np.sign(np.sin(2 * np.pi * ph)) * 0.55 + np.sin(2 * np.pi * ph) * 0.6
    return body * np.exp(-t / 0.11)

def snare(n):
    t = np.arange(n) / SR
    return (noise(n, 16000) * 0.8 * np.exp(-t / 0.075) + tri(190, n) * 0.5 * np.exp(-t / 0.04))

def hat(n, open_=False):
    t = np.arange(n) / SR
    x = noise(n, SR)
    x = x - np.convolve(x, np.ones(4) / 4, 'same')   # crude high-pass
    return x * np.exp(-t / (0.09 if open_ else 0.018))

# ---------------------------------------------------------------- music helpers
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
def midi(name, octave): return 12 * (octave + 1) + NOTE[name]
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
MAJOR = [0, 2, 4, 5, 7, 9, 11]; MINOR = [0, 2, 3, 5, 7, 8, 10]; HARM = [0, 2, 3, 5, 7, 8, 11]
def deg(tonic, scale, d):
    o, i = divmod(d, 7); return tonic + 12 * o + scale[i]

class Song:
    def __init__(self, bpm, bars):
        self.bpm = bpm; self.s16 = 60 / bpm / 4; self.bars = bars
        self.n = int(round(bars * 16 * self.s16 * SR))
        self.tail = int(3 * SR)
        self.L = np.zeros(self.n + self.tail); self.R = np.zeros(self.n + self.tail)
        self.lL = np.zeros(self.n + self.tail); self.lR = np.zeros(self.n + self.tail)   # lead bus (gets the echo)
    def at(self, step): return int(round(step * self.s16 * SR))
    def add(self, x, step, vol=1.0, pan=0.0, bus=None):
        i = self.at(step); x = x[: len(self.L) - i]
        L, R = bus if bus else (self.L, self.R)
        L[i:i + len(x)] += x * vol * (1 - max(0, pan)); R[i:i + len(x)] += x * vol * (1 + min(0, pan))
    def note(self, m, step, dur16, inst='lead', vol=0.2, pan=0.0, **kw):
        hold = int(dur16 * self.s16 * SR * 0.92); n = hold + int(0.12 * SR)
        f = hz(m)
        if inst == 'tri': x = tri(f, n) * env(n, d=0.2, s=0.9, r=0.02, hold=hold)
        elif inst == 'bass': x = pulse(f, n, duty=0.5) * 0.6 * env(n, d=0.06, s=0.55, r=0.02, hold=hold) + tri(f, n) * 0.5 * env(n, d=0.2, s=0.9, r=0.02, hold=hold)
        elif inst == 'arp': x = pulse(f, n, duty=0.125) * env(n, d=0.03, s=0.25, r=0.01, hold=hold)
        else:
            x = pulse(f, n, duty=kw.get('duty', 0.25), vib=kw.get('vib', 0.006), slide_from=kw.get('slide')) * env(n, d=0.15, s=0.7, r=0.04, hold=hold)
            self.add(x, step, vol, pan, (self.lL, self.lR)); return
        self.add(x, step, vol, pan)
    def drum(self, kind, step, vol):
        n = int(0.35 * SR)
        x = {'k': kick, 's': snare, 'h': lambda n: hat(n), 'o': lambda n: hat(n, True)}[kind](n)
        self.add(x, step, vol, {'h': 0.25, 'o': -0.2}.get(kind, 0.0))
    def render(self, delay16=3, fb=0.4, wet=0.3):
        # lead with a ping-pong echo (wrapped around the loop so the seam keeps its echoes)
        lL, lR = self.lL.copy(), self.lR.copy(); d = self.at(delay16); g = wet
        for k in range(1, 5):
            sl, sr = (self.lR, self.lL) if k % 2 else (self.lL, self.lR)
            lL += np.roll(sl, d * k) * g; lR += np.roll(sr, d * k) * g; g *= fb
        L, R = self.L + lL, self.R + lR
        def lp(x, fc):   # one-pole low-pass
            a = np.exp(-2 * np.pi * fc / SR)
            return lfilter([1 - a], [1, -a], x)
        L, R = lp(L, 9000), lp(R, 9000)
        L[: self.tail] += L[self.n:]; R[: self.tail] += R[self.n:]          # wrap tails onto the start: seamless loop
        x = np.stack([L[: self.n], R[: self.n]], 1)
        x = np.tanh(x * 1.15) / np.tanh(1.15)
        x *= 10 ** (-15 / 20) / np.sqrt((x ** 2).mean())
        pk = np.abs(x).max()
        if pk > 0.97: x *= 0.97 / pk
        return x

def melody(song, start_bar, bars, voice, tonic, scale, octave_shift=0, vol=0.17, pan=0.0, duty=0.25, store=None, shift=0):
    """bars: list of lists of (degree | None, len16) — degree None is a rest."""
    step = start_bar * 16
    for bar in bars:
        pos = step
        for d, ln in bar:
            if d is not None:
                m = deg(tonic, scale, d + shift) + 12 * octave_shift
                song.note(m, pos, ln, 'lead', vol, pan, duty=duty)
                if store is not None: store.append((m, pos, ln))
            pos += ln
        step += 16

def chords_layer(song, start_bar, prog, tonic, scale, bass_oct=-2, arp=True, bass_style='disco', arp_vol=0.06, bass_vol=0.22):
    """prog: list of chord degrees (one per bar). Disco octave bass + 16th arpeggio of the triad."""
    for b, cd in enumerate(prog):
        bar0 = (start_bar + b) * 16
        root = deg(tonic, scale, cd) + 12 * bass_oct
        if bass_style == 'disco':
            for i in range(8):
                song.note(root + (12 if i % 2 else 0), bar0 + i * 2, 2, 'bass', bass_vol)
        elif bass_style == 'drive':
            for i in range(16):
                song.note(root + (12 if i % 4 == 2 else 0) + (7 if i % 8 == 7 else 0), bar0 + i, 1, 'bass', bass_vol * 0.9)
        elif bass_style == 'gallop':
            for i in range(4):
                for j, ln in ((0, 2), (2, 1), (3, 1)): song.note(root + (12 if j == 2 else 0), bar0 + i * 4 + j, ln, 'bass', bass_vol)
        if arp:
            tri_ = [deg(tonic, scale, cd), deg(tonic, scale, cd + 2), deg(tonic, scale, cd + 4)]
            pattern = [0, 1, 2, 1] if b % 2 == 0 else [0, 2, 1, 2]
            for i in range(16):
                song.note(tri_[pattern[i % 4]] + (12 if i >= 8 else 0), bar0 + i, 1, 'arp', arp_vol, pan=-0.35)

def drums(song, start_bar, bars, style='disco', fill_every=4, vol=1.0):
    for b in range(bars):
        s0 = (start_bar + b) * 16
        last = (b % fill_every) == fill_every - 1
        for beat in range(4):
            song.drum('k', s0 + beat * 4, 0.55 * vol)
            if beat in (1, 3): song.drum('s', s0 + beat * 4, 0.32 * vol)
            song.drum('o' if style == 'disco' else 'h', s0 + beat * 4 + 2, 0.1 * vol)
            if style != 'disco': song.drum('h', s0 + beat * 4, 0.07 * vol)
            for k in (1, 3): song.drum('h', s0 + beat * 4 + k, 0.05 * vol)
        if last:   # snare roll into the next phrase
            for k in (12, 13, 14, 15): song.drum('s', s0 + k, (0.18 + 0.05 * (k - 12)) * vol)
        if style == 'drive' and b % 2 == 1: song.drum('k', s0 + 14, 0.4 * vol)

def snap(mel, prog):
    """Strong beats (1 and 3) that last an 8th or more land on a chord tone: nudge a step if needed."""
    out = []
    for bi, bar in enumerate(mel):
        cd = prog[bi % len(prog)]; chord = {cd % 7, (cd + 2) % 7, (cd + 4) % 7}; pos = 0; nb = []
        for d, ln in bar:
            if d is not None and pos in (0, 8) and ln >= 2 and d % 7 not in chord:
                d = d - 1 if (d - 1) % 7 in chord else d + 1
            nb.append((d, ln)); pos += ln
        out.append(nb)
    return out

def build(spec):
    bpm, key, scale, prog, A, B, styles = spec['bpm'], spec['key'], spec['scale'], spec['prog'], spec['A'], spec['B'], spec['style']
    A, B = snap(A, prog), snap(B, prog)
    # sections: A (8) B (8) A up an octave with harmony (8) B (8) break (4) -> loop
    song = Song(bpm, 36)
    lead = []
    sections = [(0, A, 0, 0.17), (8, B, 0, 0.17), (16, A, 1, 0.13), (24, B, 0, 0.18)]
    def fit(mel, osh):   # keep the lead under ~A6 so it never turns shrill
        top = max(deg(key, scale, d) for bar in mel for d, _ in bar if d is not None) + 12 * osh
        while top > 93: osh -= 1; top -= 12
        return osh
    for bar0, mel, osh, v in sections:
        osh = fit(mel, osh)
        melody(song, bar0, mel, 'lead', key, scale, osh, v, pan=0.12, duty=spec.get('duty', 0.25), store=lead)
        chords_layer(song, bar0, prog + prog, key, scale, bass_style=styles[0])
        drums(song, bar0, 8, styles[1])
    # harmony a third below in the high A section and in the last B
    melody(song, 16, A, 'lead', key, scale, fit(A, 1), 0.07, pan=-0.3, duty=0.5, shift=-2)
    melody(song, 24, B, 'lead', key, scale, fit(B, 0), 0.06, pan=-0.3, duty=0.5, shift=-2)
    # break: arp + bass, hats only, a rising sweep into the loop
    chords_layer(song, 32, prog, key, scale, bass_style='disco', arp_vol=0.08)
    for b in range(4):
        for k in range(0, 16, 2): song.drum('h', (32 + b) * 16 + k, 0.06)
        if b >= 2:
            for k in range(0, 16, 4): song.drum('k', (32 + b) * 16 + k, 0.45)
    for k in range(16): song.drum('s', 35 * 16 + k, 0.05 + 0.02 * k)
    return song

# ---------------------------------------------------------------- the four songs
SUNRISE = dict(   # C major, I V vi IV, bright and bouncy
    bpm=140, key=midi('C', 5), scale=MAJOR, prog=[0, 4, 5, 3], style=('disco', 'disco'),
    A=[[(4, 2), (4, 2), (5, 2), (4, 2), (2, 4), (0, 4)],
       [(1, 2), (2, 2), (4, 4), (6, 4), (4, 4)],
       [(5, 2), (4, 2), (5, 2), (7, 2), (9, 4), (7, 4)],
       [(8, 4), (7, 2), (5, 2), (3, 4), (4, 4)],
       [(4, 2), (4, 2), (5, 2), (4, 2), (7, 4), (9, 4)],
       [(8, 2), (7, 2), (6, 2), (4, 2), (8, 8)],
       [(9, 2), (8, 2), (7, 2), (5, 2), (7, 4), (4, 4)],
       [(5, 4), (6, 4), (7, 8)]],
    B=[[(9, 3), (9, 3), (8, 2), (7, 4), (5, 4)],
       [(8, 3), (8, 3), (7, 2), (5, 4), (3, 4)],
       [(7, 3), (7, 3), (6, 2), (4, 4), (2, 4)],
       [(4, 2), (5, 2), (6, 2), (7, 2), (8, 8)],
       [(9, 3), (9, 3), (8, 2), (7, 4), (9, 4)],
       [(10, 3), (10, 3), (9, 2), (8, 4), (7, 4)],
       [(7, 2), (8, 2), (9, 2), (11, 2), (12, 4), (11, 4)],
       [(11, 4), (9, 4), (8, 4), (6, 4)]])
CANOPY = dict(    # E minor, i VI III VII, heroic gallop
    bpm=146, key=midi('E', 5), scale=MINOR, prog=[0, 5, 2, 6], style=('gallop', 'disco'),
    A=[[(0, 2), (2, 2), (4, 4), (7, 2), (4, 2), (5, 4)],
       [(5, 4), (4, 2), (2, 2), (0, 4), (2, 4)],
       [(2, 2), (4, 2), (6, 4), (9, 4), (8, 4)],
       [(6, 4), (8, 4), (10, 4), (8, 4)],
       [(7, 2), (7, 2), (9, 2), (7, 2), (4, 4), (2, 4)],
       [(5, 2), (4, 2), (2, 2), (0, 2), (2, 8)],
       [(2, 2), (4, 2), (6, 2), (9, 2), (8, 4), (6, 4)],
       [(6, 4), (8, 4), (7, 8)]],
    B=[[(7, 1), (6, 1), (4, 1), (2, 1), (4, 2), (7, 2), (9, 4), (7, 4)],
       [(9, 1), (8, 1), (7, 1), (5, 1), (7, 2), (9, 2), (12, 4), (9, 4)],
       [(9, 2), (11, 2), (13, 4), (11, 2), (9, 2), (8, 4)],
       [(8, 4), (10, 4), (13, 8)],
       [(7, 1), (6, 1), (4, 1), (2, 1), (4, 2), (7, 2), (9, 4), (11, 4)],
       [(12, 2), (11, 2), (9, 2), (7, 2), (12, 4), (14, 4)],
       [(13, 2), (11, 2), (9, 2), (11, 2), (13, 4), (16, 4)],
       [(15, 4), (13, 4), (14, 8)]])
EMBER = dict(     # D minor, i VI VII v, driving 16th bass
    bpm=152, key=midi('D', 5), scale=MINOR, prog=[0, 5, 6, 4], style=('drive', 'drive'), duty=0.125,
    A=[[(0, 3), (0, 3), (2, 2), (4, 4), (3, 2), (2, 2)],
       [(5, 3), (4, 3), (2, 2), (0, 8)],
       [(6, 3), (6, 3), (8, 2), (9, 4), (8, 2), (6, 2)],
       [(4, 3), (6, 3), (8, 2), (11, 8)],
       [(7, 3), (7, 3), (9, 2), (11, 4), (10, 2), (9, 2)],
       [(10, 3), (9, 3), (7, 2), (5, 8)],
       [(6, 2), (8, 2), (9, 2), (10, 2), (11, 4), (13, 4)],
       [(11, 4), (9, 4), (8, 4), (6, 4)]],
    B=[[(7, 1), (None, 1), (7, 1), (None, 1), (9, 2), (7, 2), (10, 4), (9, 4)],
       [(8, 1), (None, 1), (8, 1), (None, 1), (10, 2), (8, 2), (12, 4), (10, 4)],
       [(9, 1), (None, 1), (9, 1), (None, 1), (11, 2), (9, 2), (13, 4), (11, 4)],
       [(11, 2), (12, 2), (13, 2), (14, 2), (13, 8)],
       [(14, 2), (13, 2), (11, 2), (9, 2), (14, 4), (12, 4)],
       [(12, 2), (10, 2), (9, 2), (7, 2), (12, 4), (10, 4)],
       [(13, 2), (12, 2), (10, 2), (8, 2), (13, 4), (15, 4)],
       [(14, 4), (11, 4), (13, 8)]])
MOON = dict(      # B harmonic minor, i VI iv V, the tiger at your heels
    bpm=158, key=midi('B', 4), scale=HARM, prog=[0, 5, 3, 4], style=('drive', 'drive'), duty=0.25,
    A=[[(7, 2), (6, 2), (7, 2), (4, 2), (2, 2), (4, 2), (0, 4)],
       [(5, 2), (4, 2), (5, 2), (2, 2), (0, 2), (2, 2), (5, 4)],
       [(3, 2), (2, 2), (3, 2), (5, 2), (8, 4), (7, 4)],
       [(6, 2), (5, 2), (6, 2), (8, 2), (11, 8)],
       [(7, 2), (6, 2), (7, 2), (9, 2), (11, 2), (9, 2), (7, 4)],
       [(12, 2), (11, 2), (12, 2), (9, 2), (7, 2), (9, 2), (12, 4)],
       [(10, 2), (9, 2), (10, 2), (12, 2), (14, 4), (12, 4)],
       [(13, 4), (11, 4), (10, 4), (13, 4)]],
    B=[[(14, 1), (13, 1), (11, 1), (9, 1), (7, 1), (9, 1), (11, 1), (13, 1), (14, 4), (11, 4)],
       [(12, 1), (11, 1), (9, 1), (7, 1), (5, 1), (7, 1), (9, 1), (11, 1), (12, 4), (9, 4)],
       [(10, 1), (9, 1), (7, 1), (5, 1), (3, 1), (5, 1), (7, 1), (9, 1), (10, 4), (12, 4)],
       [(11, 2), (13, 2), (14, 2), (13, 2), (11, 8)],
       [(14, 2), (14, 2), (16, 2), (14, 2), (13, 4), (11, 4)],
       [(12, 2), (12, 2), (14, 2), (12, 2), (11, 4), (9, 4)],
       [(10, 2), (12, 2), (14, 2), (17, 2), (16, 4), (14, 4)],
       [(13, 4), (11, 4), (13, 4), (11, 4)]])

if __name__ == '__main__':
    keep = '--wav' in sys.argv
    for name, spec in (('sunrise', SUNRISE), ('canopy', CANOPY), ('ember', EMBER), ('moon', MOON)):
        x = build(spec).render()
        wav = f'/tmp/music-{name}.wav'
        import wave
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', f'music-{name}.ogg'], check=True)
        print(name, f'{len(x) / SR:.1f}s', spec['bpm'], 'bpm')
