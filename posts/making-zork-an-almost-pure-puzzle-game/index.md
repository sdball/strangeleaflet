---
title: Making Zork an (almost) pure puzzle game
slug: making-zork-an-almost-pure-puzzle-game
published_date: 2026-11-07T17:34:50+00:00
tags: videogames, zork
meta_description: Zork depends on luck and saving your way through. An in-browser z-machine interpreter can keep the game intact and still change how it plays.
publish: true
---

I've always loved ZORK but parts of it have always kind of grated on me in that it isn't purely a cerebral puzzle game but depends on some luck and essentially requires you to save/restore your way through the game.

<zork-screen room="West of House" score="0" moves="0">

<pre>ZORK I: The Great Underground Empire
Infocom interactive fiction - a fantasy story
Copyright (c) 1981, 1982, 1983, 1984, 1985, 1986 Infocom, Inc. All rights reserved.
ZORK is a registered trademark of Infocom, Inc.
Release 0 / Serial number 261104

West of House
You are standing in an open field west of a white house, with a boarded front door.
There is a small mailbox here.

&gt;</pre>

</zork-screen>

<small>The start of Zork I in the curio's Atari 800 screen. [Play it there](https://curious.strangeleaflet.com/z-machine-interpreter/#zork1).</small>

What to do about it? I thought it would mean having to compile a custom version of the game. But it turnss out to be possible to keep the z-machine game completely as-is and have the z-machine interpreter optionally manipulate how the game plays.

So Claude and I did. I've got an [in-browser z-machine interpreter](https://curious.strangeleaflet.com/z-machine-interpreter/#zork1) over on the cabinet of curios.

## Cheats

For ZORK you can set a few options:

- **Thief stays home**: ensure the thief stays in his treasure room instead of randomly wandering around the map.
- **Stable objects**: ensure that items remain where you dropped them instead of randomly teleporting around the map.
- **Endless lights**: ensure that none of the light sources can run out.
- **Well lit**: ignore darkness completely.

Those last two are absolutely cheats, but I think the first two really nicely fit with the game. Or with my idea of the game.

Having the thief stay in the treasure room turns him into a puzzle instead of a potentially game ending random encounter.

When you have enough of a score you can find his treasure room and find him there guarding the chalice (and any stolen treasures if you made him stay home after he's stolen things from you). You can still have him open the egg if you realize that's possible (uh spoilers).

There is still an element of randomness in the combat. But the point is that you can face the thief on your terms with intent by thinking about it instead of saving and reloading frequently.

The stable objects also mean you can actually map out the mazes directly instead of having to get lucky and hope that the game keeps the items stable while you're mapping.

## Enhanced

And there's more! I have an option to turn on "Enhanced" Zork which gives you a few things that feel like you should have as the player character.

- Know how much of a burden you're carrying instead of getting surprised when your character can't pick something up.
- See your health directly instead of having to type diagnose.
- See the power level of the lamp. It's battery powered after all.
- Keep track of your treasure count.
- Have an indicator to know if the room you're in is naturally lit or not. This one always really bugged me because your character should just see that instead of making you turn off the lamp to find out.

## Tools

There's also an inspector view to see the current game state and object list. Kind of like a web browser inspector for the z-machine.

An automatically generating map if you want to use it.

A built-in notes editor.

The saves also use the Quetzal formatting standard so you can save/load from other interpreters.

AND the built-in notes and map are included in the save files as you and you can choose if you want to reload them from the save.

There's a few themes to pick from as well including an Atari 800 theme that's pretty close to how I remember playing in the 80s. Although I still need to make some more tweaks.

I'm having a blast re-discovering the games and making them more of the pure puzzle experience I always wanted.

<script type="module" src="zork-screen.js"></script>

