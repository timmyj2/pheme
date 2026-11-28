import { IconArrowDown } from "../../lib/icons.ts";
import { TID } from "../../testids.ts";

/** The floating pill shown when the reader has scrolled away from the newest content. */
export function ScrollToBottom({ approvalBelow, unseen, onClick }: { approvalBelow: boolean; unseen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="scroll-bottom"
      data-testid={TID.scrollToBottom}
      data-attention={approvalBelow ? "approval" : undefined}
      data-unseen={unseen || undefined}
      onClick={onClick}
    >
      <IconArrowDown className="size-3.5" aria-hidden="true" />
      {approvalBelow ? "Approval needed" : "Scroll to bottom"}
    </button>
  );
}
