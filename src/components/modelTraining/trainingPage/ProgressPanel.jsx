import React from "react";
import { Cpu, StopCircle, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import useThemeColors from "../../../hooks/useThemeColors";

const TERMINAL = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"]);
const STATE_STYLE = {
  PROGRESS: "bg-acS text-ac",
  SUCCESS: "bg-okBg text-ok",
  FAILED: "bg-errBg text-err",
  CANCELLED: "bg-warnBg text-warn",
  TIMED_OUT: "bg-errBg text-err",
  starting: "bg-well text-t2",
};

export default function ProgressPanel({ snapshot, onStop, isStopping }) {
  const { colors } = useThemeColors();
  const total = snapshot.total_epochs || 0;
  const current = snapshot.epoch || 0;
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const lossData = (snapshot.loss || []).map((d) => ({ epoch: d.epoch, loss: d.value }));
  const trainingParameters = snapshot.training_parameters || {};
  const isActive = !TERMINAL.has(snapshot.state) && snapshot.state !== "starting";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-t2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_STYLE[snapshot.state] || STATE_STYLE.starting}`}>
          {snapshot.state}
        </span>
        {snapshot.state === "starting" ? (
          <span className="flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for worker…</span>
        ) : (
          <span className="flex items-center gap-1">
            <Cpu className="w-4 h-4 text-ac" /> Epoch {current}{total ? ` / ${total}` : ""}
          </span>
        )}
      </div>

      {Object.keys(trainingParameters).length > 0 && (
        <div className="p-3 rounded-lg border border-ln bg-well">
          <h3 className="text-sm font-semibold text-t1 mb-2">Training configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {Object.entries(trainingParameters).map(([key, value]) => (
              <div key={key}>
                <span className="block text-t3 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-medium text-t1">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="w-full bg-hv2 rounded h-2">
          <div className="bg-accent h-2 rounded" style={{ width: `${percent}%`, transition: "width 0.5s" }} />
        </div>
      )}

      {snapshot.error_message && (
        <div className="p-3 rounded-lg border border-err/30 bg-errBg text-sm text-err" role="alert">
          {snapshot.error_code ? `${snapshot.error_code}: ` : ""}{snapshot.error_message}
        </div>
      )}

      {lossData.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-t1">Training loss</h3>
          <p className="text-[11px] text-t3 mb-2">
            Mask2Former combined loss (classification + mask + dice), averaged per epoch. Lower is better.
          </p>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lossData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.ln2} />
                <XAxis
                  dataKey="epoch"
                  tick={{ fontSize: 11, fill: colors.t2 }}
                  label={{ value: "epoch", position: "insideBottom", offset: -10, fontSize: 11, fill: colors.t3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: colors.t2 }}
                  width={56}
                  label={{ value: "loss", angle: -90, position: "insideLeft", fontSize: 11, fill: colors.t3 }}
                />
                <Tooltip
                  formatter={(value) => [Number(value).toFixed(4), "loss"]}
                  labelFormatter={(epoch) => `Epoch ${epoch}`}
                  contentStyle={{ backgroundColor: colors.p2, border: `1px solid ${colors.ln}`, borderRadius: '8px', color: colors.t1 }}
                  labelStyle={{ color: colors.t2 }}
                />
                <Line type="monotone" dataKey="loss" stroke={colors.ac} dot={false} name="Training loss" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-sm text-t3">No loss logged yet.</p>
      )}

      {isActive && (
        <button
          onClick={onStop}
          disabled={isStopping}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-onAccent bg-err rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
        >
          {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
          {isStopping ? "Stopping…" : "Stop Training"}
        </button>
      )}
    </div>
  );
}
