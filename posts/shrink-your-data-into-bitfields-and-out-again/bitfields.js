// The interactive parts of "Shrink your data into bitfields (and out again)".
// Each element replaces whatever it holds (the static fallback that feed
// readers and no-JS visitors see) once this module runs.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

document.head.insertAdjacentHTML("beforeend", `<style>
  bitfield-steps:defined,
  bitfield-explorer:defined,
  bitfield-length:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem 1.25rem 1.25rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length) .label {
    display: block;
    margin-bottom: .35rem;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length) .highlight {
    margin: .75rem 0 0;
    border: 1px solid var(--code-line);
    border-radius: var(--radius);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length) input[type=range] {
    width: 100%;
    min-height: 40px;
    margin: 0;
    accent-color: var(--brass);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length) p {
    margin: .75rem 0 0;
  }
  bitfield-steps pre {
    min-height: calc(6 * 1.6em + 2rem);
  }
  bitfield-steps fieldset {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: .5rem;
    margin: .75rem 0 0;
    padding: 0;
    border: 0;
  }
  bitfield-steps label {
    display: flex;
    align-items: center;
    gap: .5rem;
    min-height: 44px;
    padding: .35rem .75rem;
    font-family: var(--type);
    font-size: .9rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  bitfield-steps label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  bitfield-steps input[type=radio] {
    margin: 0;
    accent-color: var(--brass);
  }
  bitfield-explorer dl {
    display: grid;
    gap: .2rem 1rem;
    margin: 1rem 0 0;
  }
  bitfield-explorer dt {
    font-weight: 600;
  }
  bitfield-explorer dd {
    margin: 0 0 .5rem;
  }
  @media (min-width: 600px) {
    bitfield-steps fieldset {
      grid-template-columns: repeat(4, 1fr);
    }
    bitfield-explorer dl {
      grid-template-columns: max-content 1fr;
    }
    bitfield-explorer dd {
      margin: 0;
    }
  }
</style>`);

let ids = 0;
const uid = (name) => `${name}-${++ids}`;

function fadeIn(el) {
  if (!reducedMotion.matches) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
}

// Going from JSON to a bitfield one step at a time
const STEPS = [
  ["JSON", JSON.stringify({ priority: "urgent", location: "Room 71", status: "empty", candy: "peppermint patties" }, null, 2)],
  ["No keys", JSON.stringify(["urgent", "Room 71", "empty", "peppermint patties"], null, 2)],
  ["Limited values", JSON.stringify([3, 71, 1, 0], null, 2)],
  ["Bitfield", "1110001111000\n\n(7288 in base-10)"],
];

customElements.define("bitfield-steps", class extends HTMLElement {
  connectedCallback() {
    const name = uid("step");
    this.innerHTML = `
      <div class="highlight"><pre aria-live="polite"></pre></div>
      <fieldset>
        <legend class="label">Step</legend>
        ${STEPS.map(([label], i) => `<label><input type="radio" name="${name}" value="${i}"${i ? "" : " checked"}> ${label}</label>`).join("")}
      </fieldset>`;
    const pre = this.querySelector("pre");
    const show = (i) => {
      pre.textContent = STEPS[i][1];
      fadeIn(pre);
    };
    this.querySelector("fieldset").addEventListener("change", (e) => show(Number(e.target.value)));
    pre.textContent = STEPS[0][1];
  }
});

// A 16 bit bitfield read as different kinds of data
const asciiOrCodePoint = (byte) =>
  byte >= 32 && byte <= 126 ? `"${String.fromCharCode(byte)}"` : `U+${byte.toString(16).toUpperCase().padStart(4, "0")}`;

customElements.define("bitfield-explorer", class extends HTMLElement {
  connectedCallback() {
    const id = uid("bitfield-explorer");
    this.innerHTML = `
      <label class="label" for="${id}">Explore possible representations of a 16 digit bitfield</label>
      <input type="range" id="${id}" min="0" max="${0b1111111111111111}" value="21332">
      <dl aria-live="polite">
        <dt>As binary (base-2)</dt><dd><code data-binary></code></dd>
        <dt>As a single 16-bit base-10 integer</dt><dd data-int16></dd>
        <dt>As two ASCII characters or code points</dt><dd data-chars></dd>
        <dt>As two 8-bit base-10 integers</dt><dd data-int8s></dd>
      </dl>`;
    const input = this.querySelector("input");
    const out = (name) => this.querySelector(`[data-${name}]`);
    const update = () => {
      const bitfield = Number(input.value);
      const left = bitfield >> 8;
      const right = bitfield & 0b11111111;
      out("binary").textContent = bitfield.toString(2).padStart(16, "0");
      out("int16").textContent = bitfield;
      out("chars").textContent = `${asciiOrCodePoint(left)} and ${asciiOrCodePoint(right)}`;
      out("int8s").textContent = `${left} and ${right}`;
    };
    input.addEventListener("input", update);
    update();
  }
});

// How many values a bitfield of a given length can hold
const randomBits = (length) => Array.from({ length }, () => (Math.random() < 0.5 ? "0" : "1")).join("");

customElements.define("bitfield-length", class extends HTMLElement {
  connectedCallback() {
    const id = uid("bitfield-length");
    this.innerHTML = `
      <label class="label" for="${id}">Bitfield length: <b data-length></b></label>
      <input type="range" id="${id}" min="1" max="31" value="16">
      <p>Number of possible values: <code data-values></code></p>
      <p>Example bitfields and their base-10 values</p>
      <div class="highlight"><pre aria-live="polite"></pre></div>`;
    const input = this.querySelector("input");
    const update = () => {
      const n = Number(input.value);
      this.querySelector("[data-length]").textContent = n;
      this.querySelector("[data-values]").textContent = 2 ** n;
      this.querySelector("pre").textContent = [1, 2, 3]
        .map(() => randomBits(n))
        .map((bits) => `${bits} = ${parseInt(bits, 2)}`)
        .join("\n");
    };
    input.addEventListener("input", update);
    update();
  }
});
