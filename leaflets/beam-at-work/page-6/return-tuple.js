// <return-tuple>: a diagram, not a widget. handle_call's return value,
// {:reply, reply, new_state}, in large type with each part labelled: what to
// do, what goes back to the caller, and the state the loop carries on with.
// new_state is drawn in brass, the colour both widgets on the page use for
// the state.
//
// The element holds a text version of the same diagram (what feed readers
// and no-JS visitors see) and replaces it once this module runs. The type
// scales with the element's width so the tuple fits on a phone.

const PARTS = [
  { code: ":reply", cls: "a", label: "what to do: send a reply" },
  { code: "reply", cls: "", label: "sent back to the caller" },
  { code: "new_state", cls: "sv", label: "the state the loop carries on with" },
];

document.head.insertAdjacentHTML("beforeend", `<style>
  return-tuple:defined {
    display: block;
    margin: 1.5rem 0;
    padding: 1.25rem 1rem 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--code-bg);
    container: return-tuple / inline-size;
  }
  return-tuple .tuple {
    display: grid;
    grid-template-columns: auto repeat(${PARTS.length}, auto) auto;
    justify-content: center;
    column-gap: .15em;
    row-gap: .5rem;
    font-family: var(--code);
    /* the tuple is 26 characters wide; this keeps it inside the box */
    font-size: clamp(1rem, 6cqi, 2.4rem);
    color: var(--code-ink);
  }
  return-tuple .code {
    grid-row: 1;
    white-space: nowrap;
    line-height: 1.2;
  }
  return-tuple .a { color: var(--code-symbol); }
  return-tuple .sv {
    padding: 0 .2em;
    border-radius: .15em;
    font-weight: 700;
    color: var(--bg);
    background: var(--brass);
  }
  return-tuple .label {
    grid-row: 2;
    padding-top: .35rem;
    border-top: 2px solid var(--code-ink);
    font-family: var(--type);
    font-size: clamp(.75rem, 2.6cqi, 1rem);
    line-height: 1.3;
    text-align: center;
    color: var(--muted);
  }
  /* Each bracket in its part's colour */
  return-tuple .label.of-a { border-top-color: var(--code-symbol); }
  return-tuple .label.of-sv { border-top-color: var(--brass); }
  return-tuple .comma {
    color: var(--code-ink);
    font-weight: 400;
    background: none;
  }
</style>`);

customElements.define("return-tuple", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const last = PARTS.length - 1;
    this.setAttribute("role", "img");
    this.setAttribute(
      "aria-label",
      "handle_call returns {:reply, reply, new_state}. :reply says what to do: send a reply. reply is sent back to the caller. new_state is the state the loop carries on with.",
    );
    this.innerHTML = `
      <div class="tuple" aria-hidden="true">
        <span class="code" style="grid-column: 1">{</span>
        ${PARTS.map((p, i) => `
          <span class="code" style="grid-column: ${i + 2}"><span class="${p.cls}">${p.code}</span>${i < last ? `<span class="comma">,</span>` : ""}</span>
          <span class="label${p.cls ? ` of-${p.cls}` : ""}" style="grid-column: ${i + 2}">${p.label}</span>`).join("")}
        <span class="code" style="grid-column: ${PARTS.length + 2}">}</span>
      </div>`;
  }
});
