---
title: See where vim settings came from
slug: see-where-vim-settings-came-from
published_date: 2022-03-15T04:00:00+00:00
tags: vim
publish: true
is_page: false
---

Ever wonder which plugin or config in vim is responsible for setting something like tabs to represent as four spaces? (e.g. `ts=4`)

Wonder no more! vim will tell you! The magic is the `verbose` keyword in the setting query

```
:verbose set ts?
  tabstop=2
        Last set from ~/.vimrc line 86:
```

```
:verbose set ts?
  tabstop=2
        Last set from ~/.vim/ftplugin/go.vim line 1
```
