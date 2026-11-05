// Play a page's short looping clips the way GIFs would: silently, on repeat, no controls.
//
//   <video loop muted playsinline controls preload="metadata" poster="clip.jpg" ...>
//
// Without this module (no JS, feed readers) each clip is its poster with controls.
// Readers who prefer reduced motion keep that: paused, with controls to play it.

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clips = document.querySelectorAll("video[loop][muted]");

function update() {
  for (const clip of clips) {
    if (reduce.matches) {
      clip.pause();
      clip.controls = true;
    } else {
      clip.controls = false;
      // Autoplay can still be refused (iOS Low Power Mode); leave the controls then.
      clip.play().catch(() => { clip.controls = true; });
    }
  }
}

update();
reduce.addEventListener("change", update);
