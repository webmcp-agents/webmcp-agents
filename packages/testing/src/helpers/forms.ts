import { fixture } from "./dom";

/** Options for {@link toolForm}. */
export interface ToolFormOptions {
  /** The fields' markup. Default one labelled number field, `qty` (min 1, value 1). */
  fields?: string;
  /** `tooldescription`. Default `"Add mugs to the cart"`. */
  description?: string;
  /** The submit button's text. Default `"Add to cart"`. */
  submit?: string;
  /** Submit as soon as the agent filled it (`toolautosubmit`). Default true; false parks on the submit button. */
  autosubmit?: boolean;
  /** What the form answers the agent: text, or a function of the form. Default `"ok"`. */
  answer?: string | ((form: HTMLFormElement) => string);
  /** Called on every submit, the agent's or the person's. */
  onSubmit?: (form: HTMLFormElement) => void;
}

/**
 * A declarative tool form in a {@link fixture}, registered by the polyfill (or Chrome) as the tool `name`. Its submit
 * never navigates; an agent's submit is answered with `answer`.
 *
 * @example
 * toolForm("add_to_cart", { autosubmit: false });   // parks on "Add to cart" until a trusted click
 */
export function toolForm(name: string, options: ToolFormOptions = {}): HTMLFormElement {
  const {
    fields = '<label>qty <input name="qty" type="number" min="1" value="1"></label>',
    description = "Add mugs to the cart",
    submit = "Add to cart",
    autosubmit = true,
    answer = "ok",
    onSubmit = () => {},
  } = options;
  const root = fixture(`
    <form toolname="${name}" tooldescription="${description}" ${autosubmit ? "toolautosubmit" : ""}>
      ${fields}
      <button type="submit">${submit}</button>
    </form>`);
  const form = root.querySelector("form") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(form);
    const ev = e as SubmitEvent;
    if (ev.agentInvoked) ev.respondWith?.(Promise.resolve(typeof answer === "function" ? answer(form) : answer));
  });
  return form;
}

/** Options for {@link echoForm}. */
export interface EchoFormOptions {
  /** Submit as soon as the agent filled it. Default true. */
  autosubmit?: boolean;
  /** Put before the word in the answer. Default `"ok: "`. */
  prefix?: string;
}

/**
 * A declarative tool form with one required field, `word`, that answers `prefix + word`. Handy for agent and chat
 * tests that need a real page tool.
 */
export function echoForm(name: string, { autosubmit = true, prefix = "ok: " }: EchoFormOptions = {}): HTMLFormElement {
  return toolForm(name, {
    fields: '<input name="word" required>',
    description: "Echo a word back. Second sentence.",
    submit: "Send it",
    autosubmit,
    answer: (form) => prefix + String(new FormData(form).get("word")),
  });
}
