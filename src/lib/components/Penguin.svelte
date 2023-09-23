<script>
  import { tweened } from "svelte/motion";

  export let walk = false;
  export let insight = false;
  export let speed = 10;

  let pos = tweened(0);
  let walking = false;
  let contentWidth = 900;
  let maxWidth = 390;
  let duration = 0;

  /** @type {boolean} */
  let flip;

  /** @type {number} */
  let innerWidth;

  /**
   * Calculate a duration as a distance between two points multiplied by a speed
   *
   * @param {number} x - first point
   * @param {number} y - second point
   * @param {number} s - penguin walking speed (1–100)
   * @returns {number} calculated duration
   */
  const calculateDuration = (x, y, s) => {
    if (s > 100) {
      s = 100;
    }

    if (s < 1) {
      s = 1;
    }

    return Math.abs(x - y) * (100 / s);
  };

  function startWalking() {
    walking = true;
    if (flip === undefined) {
      pos.set($pos, { duration: 0 });
    } else {
      adjustWalkWidth();
    }
  }

  function stopWalking() {
    walking = false;
    pos.set($pos, { duration: 0 });
  }

  function adjustWalkWidth() {
    if (!walking) return;
    duration = flip ? calculateDuration($pos, from, speed) : calculateDuration($pos, to, speed);
    pos.set(flip ? from : to, { duration });
  }

  $: to = innerWidth > contentWidth ? maxWidth : (innerWidth * 0.9) / 2 - 32;
  $: from = innerWidth > contentWidth ? -maxWidth : ((innerWidth * 0.9) / 2 - 32) * -1;
  $: innerWidth && adjustWalkWidth();
  $: walk && !walking && startWalking();
  $: !walk && walking && stopWalking();
  $: if ($pos >= to) {
    flip = true;
    duration = calculateDuration($pos, from, speed);
    pos.set(from, { duration });
  }
  $: if ($pos <= from) {
    flip = false;
    duration = calculateDuration($pos, to, speed);
    pos.set(to, { duration });
  }
  $: penguinGif = walk ? "penguin.gif" : "penguin_static.gif";
</script>

<svelte:window bind:innerWidth />

{#if insight}
  <pre>
gif: {penguinGif}
walk: {walk}
walking: {walking}
innerWidth: {innerWidth}
from: {from.toFixed(0)}
to: {to.toFixed(0)}
pos: {$pos.toFixed(0)}
duration: {duration}
flip: {flip}
speed: {speed}
</pre>
{/if}

<div class="penguin" style="transform: translateX({$pos}px) rotateY({flip ? 180 : 0}deg);">
  <img alt="a cartoon penguin walking" src="/images/{penguinGif}" />
</div>

<style>
  .penguin {
    width: 64px;
    height: 70px;
    margin: 44px auto 24px auto;
  }
</style>
