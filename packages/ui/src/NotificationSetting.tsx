import { useState } from "react";
import { notifyEnabled, notifySupport, setNotify } from "./notify.ts";

/** Settings row for desktop notifications. The choice is per browser, because permission is. */
export function NotificationSetting() {
  const [on, setOn] = useState(notifyEnabled);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const support = notifySupport();
  return (
    <div className="panel">
      <h3>Notifications</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          disabled={busy || support === "unsupported"}
          onChange={async (e) => {
            setBusy(true);
            const r = await setNotify(e.target.checked);
            setOn(r.enabled);
            setProblem(r.problem ?? "");
            setBusy(false);
          }}
        />
        Show a desktop notification when a reply is ready or a tool needs your approval
      </label>
      <p className="muted small">Only when you are not looking at that chat. While this tab is in the background, your browser may delay checks by up to a minute. This setting is stored in this browser.</p>
      {support === "unsupported" && <p className="muted small">This browser does not support desktop notifications.</p>}
      {problem && <p className="notice error" role="alert">{problem}</p>}
    </div>
  );
}
