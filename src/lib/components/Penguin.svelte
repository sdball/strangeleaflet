<script>
  import { tweened } from "svelte/motion";

  export let walk = false;
  export let insight = false;
  export let speed = 10;

  let pos = tweened(0);
  let walking = false;
  let contentWidth = 900;
  let maxWidth = 390;

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
    adjustWalkWidth();
    // pos.set(to, { duration: calculateDuration($pos, from, speed) });
  }

  function stopWalking() {
    walking = false;
    pos.set($pos, { duration: 0 });
  }

  function adjustWalkWidth() {
    if (!walking) return;
    const duration = flip
      ? calculateDuration($pos, from, speed)
      : calculateDuration($pos, to, speed);
    pos.set(flip ? from : to, { duration });
  }

  $: to = innerWidth > contentWidth ? maxWidth : (innerWidth * 0.9) / 2 - 32;
  $: from = innerWidth > contentWidth ? -maxWidth : ((innerWidth * 0.9) / 2 - 32) * -1;
  $: innerWidth && adjustWalkWidth();
  $: walk && !walking && startWalking();
  $: !walk && walking && stopWalking();
  $: $pos >= to &&
    (flip = true) &&
    pos.set(from, { duration: calculateDuration($pos, from, speed) });
  $: $pos <= from &&
    !(flip = false) &&
    pos.set(to, { duration: calculateDuration($pos, to, speed) });
  $: penguinGif = walk ? "penguin.gif" : "penguin_static.gif";
</script>

<svelte:window bind:innerWidth />

{#if insight}
  <pre>
gif: {penguinGif}
walking: {walking}
innerWidth: {innerWidth}
from: {from.toFixed(0)}
to: {to.toFixed(0)}
pos: {$pos.toFixed(0)}
speed: {speed}
</pre>
{/if}

<div class="penguin" style="transform: translateX({$pos}px) rotateY({flip ? 180 : 0}deg);">
  <img alt="a cartoon penguin walking" src="/{penguinGif}" />
</div>

<style>
  .penguin {
    width: 64px;
    height: 70px;
    margin: 44px auto 24px auto;
  }
</style>
