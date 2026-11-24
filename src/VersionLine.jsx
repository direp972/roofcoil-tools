import React from "react";
import { sectionsOf, sectionLabel } from "../versions.mjs";

// One quiet line with an app's section versions, read from versions.mjs (RoofCoil's release
// log numbers): "New Order vX.Y.Z · Pricing & Catalog vX.Y.Z · …". Each "Name vX.Y.Z ·" holds
// together (a no-break space before the dot), so on a phone the line wraps between sections.
export default function VersionLine({ app, style }) {
  const list = sectionsOf(app);
  return (
    <div style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {list.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && " "}
          <span style={{ whiteSpace: "nowrap" }}>{sectionLabel(s)}{i < list.length - 1 && "\u00a0·"}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
