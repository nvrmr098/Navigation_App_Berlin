#!/usr/bin/env python3
"""Spread crowded stations apart in the schematic layout (connections are not changed).
Usage: python3 -I spread_layout.py <data.json in> <data.json out>   (run after build_data.py)"""
import json, math, sys
d = json.load(open(sys.argv[1])); st = d['stations']
VSTRETCH = 1.3  # phones are tall, the layout was wide
n = len(st); X0 = [s[3] for s in st]; Y0 = [s[4] * VSTRETCH for s in st]; X = X0[:]; Y = Y0[:]
DM = 0.85
for it in range(500):
    fx = [0.0] * n; fy = [0.0] * n
    for i in range(n):
        for j in range(i + 1, n):
            dx = X[i] - X[j]; dy = Y[i] - Y[j]; r = math.hypot(dx, dy)
            if r < DM:
                if r < 1e-6: dx, dy, r = 1e-3, 0.0, 1e-3
                m = (DM - r) / 2 * 0.5
                fx[i] += dx / r * m; fy[i] += dy / r * m; fx[j] -= dx / r * m; fy[j] -= dy / r * m
    for i in range(n):
        fx[i] += (X0[i] - X[i]) * 0.008; fy[i] += (Y0[i] - Y[i]) * 0.008
        X[i] += fx[i]; Y[i] += fy[i]
for i in range(n):
    st[i][3] = round(X[i], 3); st[i][4] = round(Y[i], 3)
json.dump(d, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print('moved: max', round(max(math.hypot(X[i] - X0[i], Y[i] - Y0[i]) for i in range(n)), 2))
