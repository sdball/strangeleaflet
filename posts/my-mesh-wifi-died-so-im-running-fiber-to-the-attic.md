---
title: My mesh WiFi died, so I'm running fiber to the attic
slug: my-mesh-wifi-died-so-im-running-fiber-to-the-attic
tags: networking, hardware
meta_description: My Plume mesh WiFi died on a Saturday morning. Plume has already left the consumer business, so I'm replacing it with the fiber gateway's own WiFi and a 10G single-mode fiber link to my attic office ethernet switch.
publish: false
---

On Saturday morning, October 24th, we all woke up to no Internet. Well almost entirely no Internet. Two of our Plume SuperPods were offline, one was going on and off randomly. Restarting the pods didn't help at all. They'd worked for years with no changes but I guess with Plume's residential support shutting down this was finally the impetus to change our network.

- A laptop plugged straight into the AT&T fiber gateway got online just fine.
  The ISP connection was working.
- A device wired into the main Plume pod, the one connected to the gateway via ethernet, got
  nothing at all.

Maybe there was a power surge or maybe a bad firmware update overnight. Either way let's change it up!

## The new plan

Our house is three stories with my office in the attic. Originally the Plume network was great to cover WiFi because AT&T's gateway was really slow and didn't provide a strong signal. But since then we've upgraded to the BGW320 gateway. So hey maybe the gateway's own WiFi can handle things.

Turns out it works great! I setup its internal WiFi to match the Plume network SSID and password and all of our devices could just hop right back on without the lag or dead spots we had before.

So great! The plan now is the gateway's WiFi for the house, and a new wired link to the attic.

I've thought for a while about having a fiber run instead of two ethernet runs with a Plume superpod intermediary. So this is a great time to try that out and setup a 10G fiber link.

```text
AT&T fiber
    |
BGW320-500 gateway  (WiFi for the house)
    |  ethernet
ES210X-M2 switch
    |  10G single-mode fiber
ES210X-M2 switch  (attic office)
    |  ethernet
all the wired things in my office
```

The parts:

- Two TP-Link Omada ES210X-M2 switches. Each has eight 2.5G ports and two 10G
  SFP+ slots.
  One goes beside the gateway, and the other replaces a 6-port switch in
  the attic office.
- Two TP-Link SM5110-LR modules: 10GBASE-LR, single-mode. One for each
  switch's SFP+ slot.
- A run of OS2 single-mode armored fiber cable, LC to LC (UPC), uniboot.
  Uniboot means both strands of the pair share one connector boot, so it's a
  single thin cable end to end.

The run from the gateway to the attic goes through a surface raceway I setup for the Plume ethernet backhaul. Now it'll carry a single fiber run directly from the gateway to the office switch.

## Why fiber?

Capacity and coolness! A fiber run should be plenty futureproofed for future speed and it's just cool to have data via light.

### An ethernet coupler for now

Until the fiber is in, the attic still needs a wired connection. The old Plume
pod on the second floor used to sit between the two ethernet cables, so
I joined them with an RJ45 coupler right where it used to be. One
continuous-ish cable to the office.

