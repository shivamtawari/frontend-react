import React from "react";
import { Clock } from "lucide-react";

const STATE_STYLE = {
  PROGRESS: "bg-acS text-ac",
  SUCCESS: "bg-okBg text-ok",
  FAILED: "bg-errBg text-err",
  CANCELLED: "bg-warnBg text-warn",
  TIMED_OUT: "bg-errBg text-err",
  starting: "bg-well text-t2",
};

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : "—");
const lastLoss = (snap) => (snap?.loss?.length ? snap.loss[snap.loss.length - 1].value : null);

export default function RunCard({ run, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        selected ? "border-acLn bg-acS" : "border-ln bg-p1 hover:bg-hv"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATE_STYLE[run.state] || STATE_STYLE.starting}`}>
          {run.state}
        </span>
        <span className="text-[11px] text-t3 flex items-center gap-1">
          <Clock size={11} /> {fmtTime(run.start_time)}
        </span>
      </div>
      <div className="text-xs text-t2">
        {run.run_name && (
          <p className="text-xs font-medium text-t1 truncate mb-0.5">{run.run_name}</p>
        )}
        {(run.label_ids?.length ?? 0)} class{(run.label_ids?.length ?? 0) === 1 ? "" : "es"}
        {run.total_epochs ? ` · ${run.epoch}/${run.total_epochs} epochs` : ""}
        {lastLoss(run) != null ? ` · loss ${lastLoss(run).toFixed(3)}` : ""}
      </div>
    </button>
  );
}
