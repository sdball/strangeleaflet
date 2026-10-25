---
title: Add helix shortcuts - sdball/dotfiles
slug: add-helix-shortcuts
published_date: 2023-01-08T14:20:00+00:00
tags: git blog, helix
publish: true
is_page: false
---

C-f will run the format command which uses the current language server
to format the file.

C-r will reflow (hard wrap) the current selected text to a width of
80 characters. It's not quite as context aware as vim for wrapping
contents but it's still pretty great.

I need to figure out how to change the wrap length per language type.
For example I'd like to wrap Git commit messages at 70 characters.
Even more ideally wrap Git titles at 50 and bodies at 70. But this is
a good start.

[3558be2e3b9098fbadbd129d4a3262e321a2f3dd on sdball/dotfiles](https://github.com/sdball/dotfiles/commit/3558be2e3b9098fbadbd129d4a3262e321a2f3dd)

## modified files

### .config/helix/config.toml

```diff
diff --git a/.config/helix/config.toml b/.config/helix/config.toml
index dd33a76..4589301 100644
--- a/.config/helix/config.toml
+++ b/.config/helix/config.toml
@@ -9,4 +9,6 @@ g = { a = "code_action" }
 C-h = "jump_view_left"
 C-j = "jump_view_down"
 C-k = "jump_view_up"
-C-l = "jump_view_right"
+C-l = "jump_view_right"
+C-f = ":format"
+C-r = ":reflow 80"
```
