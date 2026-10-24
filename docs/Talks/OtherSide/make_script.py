#!/usr/bin/env python3
"""Write script.md from the speaker notes in index.html (run after editing the notes)."""
import html, re
from pathlib import Path

here = Path(__file__).resolve().parent
src = (here / 'index.html').read_text()

def text(fragment):
    fragment = re.sub(r'<br\s*/?>', '\n', fragment)
    fragment = re.sub(r'</p>\s*', '\n\n', fragment)
    fragment = re.sub(r'<b>(.*?)</b>', r'**\1**', fragment, flags=re.S)
    fragment = re.sub(r'<code>(.*?)</code>', r'`\1`', fragment, flags=re.S)
    fragment = re.sub(r'<[^>]+>', '', fragment)
    fragment = html.unescape(fragment)
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n[ \t]+', '\n', fragment)).strip()

out = ['# The other side of the prompt: talk script (50 minutes)', '',
       'For *Accelerating Mathematical Discovery*, Capitola, 28 Oct – 1 Nov 2026.', '',
       'Generated from the speaker notes in `index.html` by `make_script.py`. In the notes, quoted lines are',
       'in Claude\'s voice, for Nic to read or paraphrase; `[Nic: …]` marks a place for Nic\'s own view.',
       'Demo steps are on the amber cue cards (and on the phone remote).', '']
n = 0
for m in re.finditer(r'<section\b([^>]*)>(.*?)</section>', src, re.S):
    attrs, body = m.group(1), m.group(2)
    if '<section' in body:
        continue
    hidden = 'data-visibility="hidden"' in attrs
    title = re.search(r'data-title="([^"]*)"', attrs)
    title = html.unescape(title.group(1)) if title else '(untitled)'
    notes = re.search(r'<aside class="notes">(.*?)</aside>', body, re.S)
    if not hidden:
        n += 1
    head = f'## {n}. {title}' if not hidden else f'## (hidden) {title}'
    cue = re.search(r'<div class="cue[^"]*">(.*?)<div class="cue-actions">', body, re.S)
    out += [head, '']
    if cue:
        c = cue.group(1)
        h = re.search(r'<div class="cue-head">(.*?)</div>', c, re.S)
        parts = [text(x) for x in re.findall(r'<span[^>]*>(.*?)</span>', h.group(1), re.S)] if h else []
        out.append('> **' + ' · '.join(x for x in parts if x) + '**')
        for k, li in enumerate(re.findall(r'<li>(.*?)</li>', c, re.S), 1):
            out.append(f'> {k}. ' + text(li).replace('\n', ' '))
        for para in re.findall(r'<p>(.*?)</p>', c, re.S):
            out.append('> ' + text(para).replace('\n', ' '))
        out.append('')
    if notes:
        out += [text(notes.group(1)), '']
(here / 'script.md').write_text('\n'.join(out).rstrip() + '\n')
print(f'wrote script.md ({n} slides)')
