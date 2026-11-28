import { IconArrowDown } from "../../lib/icons.ts";
import { TID } from "../../testids.ts";

/** The floating pill shown when the reader has scrolled away from the newest content. */
export function ScrollToBottom({ unseen, onClick }: { unseen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="scroll-bottom"
      data-testid={TID.scrollToBottom}
      data-unseen={unseen || undefined}
      onClick={onClick}
    >
      <IconArrowDown className="size-3.5" aria-hidden="true" />
      Scroll to bottom
    </button>
  );
}
