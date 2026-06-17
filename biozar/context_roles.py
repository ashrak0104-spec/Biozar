#!/usr/bin/env python3
"""Gather context about existing roles, pages, and access control"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('biozar/web/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Find existing role/access keywords
for kw in ['requires-admin', 'hide-production', 'hide-commercial', 'switchRole', 'login', 'logout', 'user:', 'role:']:
    idx = c.find(kw)
    if idx >= 0:
        start = max(0, idx-30)
        end = min(len(c), idx+80)
        print(f'{kw}: char {idx}')
        print(f'  -> {repr(c[start:end])[:120]}')
        print()

# 2. All page IDs
print('=== ALL PAGE IDS ===')
for m in re.finditer(r'id="page-(\w+)"', c):
    print(f'  page-{m.group(1)}')

# 3. All nav items
print('\n=== ALL NAV ITEMS ===')
for m in re.finditer(r'class="nav-item[^"]*"[^>]*id="nav-(\w+)"', c):
    snippet = c[m.start():m.start()+120]
    print(f'  nav-{m.group(1)}: {snippet[:100]}')

# 4. showPage function
idx = c.find('function showPage(')
if idx >= 0:
    end = c.find('\nfunction ', idx + 10)
    print('\n=== showPage ===')
    print(c[idx:end][:600])
