status: Task 285: built pages verify that every aria-labelledby, aria-describedby, aria-controls and for attribute resolves to an id on the same page.

Round 1: addressed Codex review finding. Filtered attribute scanning to decode only `id`, `aria-labelledby`, `aria-describedby`, `aria-controls`, and `for` attributes so unrelated attributes containing entities (such as `title="&copy;"` or `href="/learn?one=1&two=2"`) are not passed to the identifier decoder. Added a regression fixture covering unrelated attributes with entities.
