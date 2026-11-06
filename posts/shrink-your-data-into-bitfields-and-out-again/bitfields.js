// The interactive parts of "Shrink your data into bitfields (and out again)".
// Each element replaces whatever it holds (the static fallback that feed
// readers and no-JS visitors see) once this module runs.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

document.head.insertAdjacentHTML("beforeend", `<style>
  bitfield-steps:defined,
  bitfield-explorer:defined,
  bitfield-length:defined,
  candy-bitfield:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem 1.25rem 1.25rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length, candy-bitfield) .label {
    display: block;
    margin-bottom: .35rem;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length, candy-bitfield) .highlight {
    margin: .75rem 0 0;
    border: 1px solid var(--code-line);
    border-radius: var(--radius);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length, candy-bitfield) input[type=range] {
    width: 100%;
    min-height: 40px;
    margin: 0;
    accent-color: var(--brass);
  }
  :is(bitfield-steps, bitfield-explorer, bitfield-length, candy-bitfield) p {
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
  candy-bitfield .whole {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: .25rem 1rem;
    margin: 0 0 .75rem;
    padding: .75rem 1rem;
    font-family: var(--code);
    background: var(--code-bg);
    border: 1px solid var(--code-line);
    border-radius: var(--radius);
  }
  candy-bitfield code {
    padding: 0;
    background: none;
    border-radius: 0;
  }
  candy-bitfield .whole [data-bits] {
    font-size: 1.5rem;
    letter-spacing: .05em;
  }
  candy-bitfield .whole [data-bits] span + span {
    margin-left: .4em;
  }
  candy-bitfield .whole [data-number] {
    font-size: 1.1rem;
    color: var(--code-ink);
  }
  candy-bitfield [data-field] {
    color: var(--field);
  }
  candy-bitfield .invalid {
    text-decoration: wavy underline var(--code-error);
    text-underline-offset: .25em;
  }
  candy-bitfield .stepper {
    display: flex;
    gap: .5rem;
    margin-top: .5rem;
  }
  candy-bitfield button,
  candy-bitfield select,
  candy-bitfield input[type=number] {
    min-height: 44px;
    font: inherit;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
  }
  /* No spinner arrows: they cover the digits, and the stepper has − and + */
  candy-bitfield input[type=number] {
    appearance: textfield;
  }
  candy-bitfield input[type=number]::-webkit-inner-spin-button,
  candy-bitfield input[type=number]::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
  candy-bitfield button {
    min-width: 44px;
    cursor: pointer;
  }
  candy-bitfield button:disabled {
    cursor: default;
    opacity: .5;
  }
  candy-bitfield .stepper input {
    width: 7ch;
    padding: 0 .5rem;
    font-family: var(--code);
    text-align: center;
  }
  candy-bitfield .fields {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: .25rem .75rem;
    margin-top: 1rem;
  }
  candy-bitfield .fields label {
    font-family: var(--type);
    font-size: .9rem;
    font-weight: 700;
  }
  candy-bitfield .fields select,
  candy-bitfield .fields .room {
    justify-self: start;
    max-width: 100%;
  }
  candy-bitfield .fields select {
    padding: 0 .5rem;
  }
  candy-bitfield .room {
    display: flex;
    align-items: center;
    gap: .4rem;
  }
  candy-bitfield .room input {
    width: 6ch;
    padding: 0 .5rem;
    font-family: var(--code);
  }
  candy-bitfield :is(select, input)[aria-invalid=true] {
    border-color: var(--code-error);
  }
  candy-bitfield .math {
    grid-column: 2;
    margin-bottom: .6rem;
    font-family: var(--code);
    font-size: .9rem;
    white-space: pre;
    overflow-x: auto;
  }
  candy-bitfield .math.sum {
    padding-top: .35rem;
    border-top: 1px solid var(--line);
  }
  candy-bitfield [data-verdict] {
    font-style: italic;
  }
  @media (min-width: 600px) {
    candy-bitfield .fields {
      grid-template-columns: max-content minmax(0, 1fr) max-content;
    }
    candy-bitfield .math {
      grid-column: 3;
      margin: 0;
      text-align: right;
    }
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

// The post's candy record as a 13 bit bitfield, built from its fields or
// decoded from any number that fits in 13 bits. Rooms are 1 to 100 and there
// are five candies, so some bitfields aren't records at all.
const ROOMS = { min: 1, max: 100 };
const FIELDS = [
  { name: "priority", bits: 2, shift: 11, color: "--code-keyword", values: ["low", "medium", "high", "urgent"] },
  { name: "location", bits: 7, shift: 4, color: "--code-function" },
  { name: "status", bits: 1, shift: 3, color: "--code-string", values: ["not empty", "empty"] },
  { name: "candy", bits: 3, shift: 0, color: "--code-number", values: ["peppermint patties", "m&ms", "reese's pieces", "butterfingers", "cookies"] },
];
const TOTAL_BITS = FIELDS.reduce((sum, f) => sum + f.bits, 0);
const MAX = 2 ** TOTAL_BITS - 1;

const fieldMax = (field) => 2 ** field.bits - 1;
const fieldValue = (field, bitfield) => (bitfield >> field.shift) & fieldMax(field);
const isValid = (field, value) =>
  field.values ? value < field.values.length : value >= ROOMS.min && value <= ROOMS.max;
const describe = (field, value) =>
  field.values ? field.values[value] ?? `no ${field.name} ${value}` : `Room ${value}`;
const clamp = (value, max) => Math.min(max, Math.max(0, Math.trunc(Number(value)) || 0));
const capitalize = (text) => text[0].toUpperCase() + text.slice(1);
const colored = (field) => `data-field style="--field: var(${field.color})"`;

customElements.define("candy-bitfield", class extends HTMLElement {
  connectedCallback() {
    const id = uid("candy-bitfield");
    const control = (field) => {
      if (!field.values) {
        return `<span class="room">Room <input type="number" id="${id}-${field.name}" min="0" max="${fieldMax(field)}" inputmode="numeric" data-input="${field.name}"></span>`;
      }
      const options = Array.from({ length: fieldMax(field) + 1 }, (_, i) =>
        i < field.values.length
          ? `<option value="${i}">${field.values[i]}</option>`
          : `<option value="${i}" disabled>${i}: not a ${field.name}</option>`);
      return `<select id="${id}-${field.name}" data-input="${field.name}">${options.join("")}</select>`;
    };
    this.innerHTML = `
      <div class="whole">
        <code data-bits>${FIELDS.map((f) => `<span ${colored(f)} data-bits-of="${f.name}"></span>`).join("")}</code>
        <code data-number></code>
      </div>
      <label class="label" for="${id}">Every ${TOTAL_BITS} bit bitfield, from 0 to ${MAX}</label>
      <input type="range" id="${id}" min="0" max="${MAX}" data-slider>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Previous bitfield">−</button>
        <input type="number" min="0" max="${MAX}" inputmode="numeric" aria-label="Bitfield as a base-10 number" data-number-input>
        <button type="button" data-step="1" aria-label="Next bitfield">+</button>
      </div>
      <div class="fields">
        ${FIELDS.map((f) => `
          <label for="${id}-${f.name}" ${colored(f)}>${capitalize(f.name)}</label>
          ${control(f)}
          <code class="math" aria-hidden="true" data-math="${f.name}"></code>`).join("")}
        <code class="math sum" aria-hidden="true" data-sum></code>
      </div>
      <p data-verdict aria-live="polite"></p>`;

    const $ = (selector) => this.querySelector(selector);
    const slider = $("[data-slider]");
    const numberInput = $("[data-number-input]");
    let bitfield = clamp(this.getAttribute("value") ?? 7288, MAX);

    // Source is the input being typed in, which keeps what the reader typed
    const set = (value, source) => {
      bitfield = clamp(value, MAX);
      const values = FIELDS.map((f) => fieldValue(f, bitfield));
      const problems = [];
      FIELDS.forEach((field, i) => {
        const value = values[i];
        const valid = isValid(field, value);
        const bits = value.toString(2).padStart(field.bits, "0");
        const part = $(`[data-bits-of="${field.name}"]`);
        part.textContent = bits;
        part.classList.toggle("invalid", !valid);
        const input = $(`[data-input="${field.name}"]`);
        if (input !== source) input.value = value;
        input.setAttribute("aria-invalid", !valid);
        $(`[data-math="${field.name}"]`).innerHTML =
          `<span ${colored(field)}>${bits.padStart(7)}</span>` +
          ` &lt;&lt; ${String(field.shift).padStart(2)} = ${String(value << field.shift).padStart(4)}`;
        if (!valid) {
          problems.push(field.values
            ? `there are only ${field.values.length} ${field.name} values, numbered 0 to ${field.values.length - 1}`
            : `rooms go from ${ROOMS.min} to ${ROOMS.max}, so there's no Room ${value}`);
        }
      });
      $("[data-number]").textContent = `= ${bitfield}`;
      // As wide as the lines above, so it lines up under them on a phone too
      $("[data-sum]").textContent = `= ${String(bitfield).padStart(4)}`.padStart(20);
      if (slider !== source) slider.value = bitfield;
      if (numberInput !== source) numberInput.value = bitfield;
      $('[data-step="-1"]').disabled = bitfield === 0;
      $('[data-step="1"]').disabled = bitfield === MAX;
      const record = FIELDS.map((f, i) => describe(f, values[i])).join(", ");
      slider.setAttribute("aria-valuetext", `${bitfield}: ${record}`);
      $("[data-verdict]").textContent = problems.length
        ? `Not a record: ${problems.join(", and ")}.`
        : `A record: ${record}.`;
    };

    const fromFields = (source) =>
      set(FIELDS.reduce((sum, f) => sum + (clamp($(`[data-input="${f.name}"]`).value, fieldMax(f)) << f.shift), 0), source);

    slider.addEventListener("input", () => set(slider.value, slider));
    // While typing, an empty box stays empty; leaving it puts the number back
    numberInput.addEventListener("input", () => numberInput.value !== "" && set(numberInput.value, numberInput));
    numberInput.addEventListener("change", () => set(numberInput.value));
    this.querySelectorAll("[data-step]").forEach((button) =>
      button.addEventListener("click", () => set(bitfield + Number(button.dataset.step))));
    this.querySelectorAll("[data-input]").forEach((input) => {
      input.addEventListener("input", () => input.value !== "" && fromFields(input));
      input.addEventListener("change", () => fromFields());
    });
    set(bitfield);
  }
});
