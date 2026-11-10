---
title: Our home network now has way more fiber
slug: our-home-network-now-has-way-more-fiber
published_date: 2026-11-10T14:33:46+00:00
tags: networking
meta_description: The new fiber run from first floor to attic office is complete. No more Plume homepods, no more temporary ethernet coupler.
publish: true
---

I finally took the time to setup our fiber run from our Internet gateway to the home office and it's great!

The parts:

- 2× TP-Link Omada ES210X-M2 switches, with power adapters
- 2× TP-Link SM5110-LR modules (10GBASE-LR, single-mode)
- 1× 30 m OS2 uniboot LC-to-LC armored fiber cable

Everything went smoothly! Almost.

My bench test was great. I had both switches on a table with fiber modules installed, connected with the fiber just all coiled up, and plugged into the ISP gateway. 10G fiber link was green! An ethernet on the second switch was great, woo!

So then came the fun part of laying the fiber run. Luckily this was pretty easy because we'd already done an ethernet run with a raceway conduit. I just added the fiber into that existing raceway and done. I also pulled out the ethernet from the second half of the run where the main Plume pod used to be. I left the ethernet going to that outlet just in case we want to add a wifi extender there in the future.

Once the fiber run was complete it was simply a matter of recreating the bench setup and...still green 10G fiber connection! Yeah!

But then I put the network through some tests and found about a 5% loss of pings every minute. No!

After a lot of iterative testing and experimentation I narrowed down the problem to two things: our home theater receiver sending discovery bursts once per minute and the cable connecting our ISP gateway to the switch. Well the receiver discovery broadcasts weren't really the problem but they were the trigger. Something about that cable handling all of the Internet wasn't up to the task and the broadcasts seemed to be what knocked it offline every minute.

Luckily the fix was easy: replace that bad cable and everything was rock solid. Over the years I've collected a random assortment of ethernet cables of varying quality. Next I'll be looking up truecable and getting everything on known good quality cables. But for now at least it's all working great!

