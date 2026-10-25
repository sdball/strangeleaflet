// <penguin-walker>: the walking penguin from this post, once a Svelte
// component, now a plain custom element. It replaces whatever it holds (the
// screenshot that feed readers and no-JS visitors see) once this module runs.
//
//   walk       start walking straight away (not with reduced motion)
//   insight    show the numbers behind the walk
//   speed      1–100, default 10
//   controls   add a button to start and stop walking

const GIFS = {
  walking: new URL("penguin.gif", import.meta.url).href,
  standing: new URL("penguin_static.gif", import.meta.url).href,
};
const WIDTH = 64;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

document.head.insertAdjacentHTML("beforeend", `<style>
  penguin-walker:defined {
    display: block;
    margin: 1.75rem 0;
  }
  penguin-walker .penguin {
    width: ${WIDTH}px;
    height: 70px;
    margin: 44px auto 24px;
  }
  penguin-walker .penguin img {
    margin: 0;
    border-radius: 0;
  }
  penguin-walker .highlight {
    margin-block: 0;
  }
  penguin-walker button {
    display: block;
    min-height: 44px;
    margin: 0 auto;
    padding: .45rem 1.1rem;
    font-family: var(--type);
    font-size: .95rem;
    color: var(--ink);
    border: 1.5px solid var(--go);
    border-radius: 999px;
    background: color-mix(in srgb, var(--go) 12%, transparent);
    cursor: pointer;
  }
  penguin-walker button[data-walking] {
    --go: var(--code-error);
  }
  penguin-walker {
    --go: var(--code-string);
  }
</style>`);

customElements.define("penguin-walker", class extends HTMLElement {
  connectedCallback() {
    if (this.track) return;

    this.speed = Math.min(100, Math.max(1, Number(this.getAttribute("speed")) || 10));
    this.pos = 0;
    this.flip = false;
    this.walking = false;
    this.duration = 0;
    this.half = 0;

    this.innerHTML = `
      ${this.hasAttribute("insight") ? `<div class="highlight"><pre></pre></div>` : ""}
      <div class="track"><div class="penguin"><img alt="a cartoon penguin" width="${WIDTH}" height="70"></div></div>
      ${this.hasAttribute("controls") ? `<button type="button"></button>` : ""}`;
    this.track = this.querySelector(".track");
    this.penguin = this.querySelector(".penguin");
    this.img = this.querySelector("img");
    this.insight = this.querySelector("pre");
    this.button = this.querySelector("button");

    this.button?.addEventListener("click", () => (this.walking ? this.stop() : this.start()));
    new ResizeObserver(() => this.measure()).observe(this.track);
    this.measure();

    if (this.hasAttribute("walk") && !reducedMotion.matches) this.start();
    else this.render();
  }

  // The penguin walks between the edges of the element
  measure() {
    this.half = Math.max(0, (this.track.clientWidth - WIDTH) / 2);
    this.pos = Math.min(this.half, Math.max(-this.half, this.pos));
    this.retarget();
    this.render();
  }

  target() {
    return this.flip ? -this.half : this.half;
  }

  // How long the rest of this stretch takes, as the Svelte tween computed it
  retarget() {
    this.duration = Math.round(Math.abs(this.pos - this.target()) * (100 / this.speed));
  }

  start() {
    this.walking = true;
    this.retarget();
    this.last = performance.now();
    const step = (now) => {
      if (!this.walking) return;
      const moved = (now - this.last) * (this.speed / 100);
      this.last = now;
      this.pos += this.flip ? -moved : moved;
      if (this.pos >= this.half || this.pos <= -this.half) {
        this.pos = Math.min(this.half, Math.max(-this.half, this.pos));
        this.flip = this.pos >= this.half;
        this.retarget();
      }
      this.render();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
    this.render();
  }

  stop() {
    this.walking = false;
    cancelAnimationFrame(this.frame);
    this.render();
  }

  render() {
    this.penguin.style.transform = `translateX(${this.pos}px) rotateY(${this.flip ? 180 : 0}deg)`;
    const gif = this.walking ? GIFS.walking : GIFS.standing;
    if (this.img.src !== gif) {
      this.img.src = gif;
      this.img.alt = this.walking ? "a cartoon penguin walking" : "a cartoon penguin standing still";
    }
    if (this.button) {
      this.button.textContent = this.walking ? "Stop Walking" : "Start Walking";
      this.button.toggleAttribute("data-walking", this.walking);
    }
    if (this.insight) {
      this.insight.textContent = [
        `gif: ${this.walking ? "penguin.gif" : "penguin_static.gif"}`,
        `walk: ${this.walking}`,
        `innerWidth: ${innerWidth}`,
        `from: ${(-this.half).toFixed(0)}`,
        `to: ${this.half.toFixed(0)}`,
        `pos: ${this.pos.toFixed(0)}`,
        `duration: ${this.duration}`,
        `flip: ${this.flip}`,
        `speed: ${this.speed}`,
      ].join("\n");
    }
  }
});
