import { Circle } from "lucide-react";
import { getStatusLabel } from "../lib/format.js";

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <Circle size={7} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  );
}

export default StatusBadge;
