// 3. On the page: the control itself. A password field, or an
// autocomplete such as cc-number or one-time-code, needs nothing.
export function PaymentFields() {
  return (
    <>
      <input name="promo" data-agent-sensitive />
      <input name="card" autoComplete="cc-number" />
      <input name="code" autoComplete="one-time-code" />
    </>
  );
}
