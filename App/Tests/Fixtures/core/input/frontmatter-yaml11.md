---
yes_value: yes
no_value: no
on_value: on
octal: 0o17
legacy_octal: 017
hex: 0x1F
sci: 1e3
inf: .inf
null_tilde: ~
date_time: 2026-10-19T10:00:00Z
multiline: |
  line one
  line two
folded: >
  folded one
  folded two
nested:
  a: 1
  b: [x, y]
anchor: &a shared
alias: *a
---
Body.
