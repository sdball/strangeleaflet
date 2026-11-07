// <zork-screen>: a still of a Version 3 Infocom game on an Atari 800, the way
// the cabinet of curios' z-machine interpreter shows its "Atari 800" screen.
// It holds a <pre> of the game's text (what feed readers and no-JS visitors
// see) and, once this module runs, puts that text on the screen under a
// status line.
//
//   room     the status line's left side
//   score    } the status line's right side
//   moves    }
//
// The cursor after the last prompt blinks unless the reader prefers reduced
// motion. VT323, from Google Fonts, is the curio's font for this screen.

document.head.insertAdjacentHTML("beforeend", `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&display=swap">
<style>
  zork-screen:defined {
    display: block;
    margin: 1.75rem 0 .5rem;
    container-type: inline-size;
    /* the Atari's own blue and white, the same by day and night */
    --atari-blue: #1A4FA3;
    --atari-white: #F2F6FF;
  }
  zork-screen .case {
    padding: clamp(.5rem, 3cqi, 1.25rem);
    background: #24221F;
    border: 1px solid #3A3630;
    border-radius: calc(var(--radius) * 2);
    box-shadow: 0 18px 30px -26px rgba(30, 20, 5, .7);
  }
  zork-screen .screen {
    color-scheme: dark;
    background: var(--atari-blue);
    color: var(--atari-white);
    border: 1px solid #3A3630;
    border-radius: var(--radius);
    overflow: hidden;
    /* VT323 is .4em a column: as big as lets the copyright line fit, down to
       a size still readable on a phone, where the lines wrap */
    font: 400 clamp(15px, calc((100cqi - 4.5rem) / 34), 22px)/1.3 "VT323", "Courier New", ui-monospace, monospace;
    font-variant-ligatures: none;
  }
  zork-screen .bar {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    padding: .1rem .75rem;
    background: var(--atari-white);
    color: var(--atari-blue);
    white-space: pre;
  }
  zork-screen .bar span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  zork-screen .bar span + span {
    flex: none;
  }
  zork-screen pre {
    margin: 0;
    padding: .6rem .75rem 1rem;
    min-height: 15lh;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    border-radius: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  zork-screen .cursor {
    display: inline-block;
    width: .4em;
    height: 1lh;
    margin-left: .4em;
    vertical-align: bottom;
    background: currentColor;
  }
  @media (prefers-reduced-motion: no-preference) {
    zork-screen .cursor {
      animation: zork-screen-blink 1.1s steps(1) infinite;
    }
  }
  @keyframes zork-screen-blink {
    50% { opacity: 0; }
  }
</style>`);

customElements.define("zork-screen", class extends HTMLElement {
  connectedCallback() {
    if (this.querySelector(".screen")) return;
    const pre = this.querySelector("pre");
    if (!pre) return;

    const room = this.getAttribute("room") || "";
    const score = this.getAttribute("score") ?? "0";
    const moves = this.getAttribute("moves") ?? "0";

    const caseEl = document.createElement("div");
    caseEl.className = "case";
    caseEl.innerHTML = `<div class="screen"><div class="bar"><span></span><span></span></div></div>`;
    const [left, right] = caseEl.querySelectorAll(".bar span");
    left.textContent = room;
    right.textContent = `Score: ${score}  Moves: ${moves}`;

    pre.textContent = pre.textContent.replace(/\s+$/, "");
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    pre.append(cursor);

    caseEl.querySelector(".screen").append(pre);
    this.replaceChildren(caseEl);
  }
});
