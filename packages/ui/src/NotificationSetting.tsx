import { useState } from "react";
import { notifyEnabled, notifySupport, setNotify } from "./notify.ts";
import { SettingsHeading, SwitchRow } from "./components/overlay/settings-rows.tsx";

/** Settings row for desktop notifications. The choice is per browser, because permission is. */
export function NotificationSetting() {
  const [on, setOn] = useState(notifyEnabled);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const support = notifySupport();
  return (
    <>
      <SettingsHeading>Notifications</SettingsHeading>
      <SwitchRow
        checked={on}
        description="Only when you are not looking at that chat. While this tab is in the background, your browser may delay checks by up to a minute. This setting is stored in this browser."
        disabled={busy || support === "unsupported"}
        label="Show a desktop notification when a reply is ready or a tool needs your approval"
        onChange={async (next) => {
          setBusy(true);
          const r = await setNotify(next);
          setOn(r.enabled);
          setProblem(r.problem ?? "");
          setBusy(false);
        }}
        below={<>
          {support === "unsupported" && <p className="text-xs text-(--ui-text-tertiary)">This browser does not support desktop notifications.</p>}
          {problem && <p className="over text-xs" role="alert">{problem}</p>}
        </>}
      />
    </>
  );
}
