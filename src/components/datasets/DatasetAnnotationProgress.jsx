import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { IMAGE_STATUSES } from "../../utils/imageStatus";

/**
 * Breakdown of a dataset's masks by annotation status.
 *
 * Driven off IMAGE_STATUSES so adding a status (as `rejected` was) shows up here
 * without a second list to keep in sync.
 */
const DatasetAnnotationProgress = ({ stats }) => {
  const rows = IMAGE_STATUSES.map((status) => ({
    key: status.key,
    name: status.label,
    color: status.chart,
    value: stats?.[status.key] || 0,
  }));

  const summed = rows.reduce((acc, row) => acc + row.value, 0);
  const total = stats?.total || summed;

  if (total === 0) {
    return (
      <p className="text-sm text-gray-500 mb-4">
        No annotations yet
      </p>
    );
  }

  const percent = (value) => Math.round((value / total) * 100);
  // Only chart the statuses that actually occur, so empty slices don't clutter it.
  const chartData = rows.filter((row) => row.value > 0);

  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">
        Annotation status:
      </h4>

      <div className="flex items-center gap-6">
        {/* Text Summary */}
        <div className="flex-1 space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <div className="flex items-center">
                <div
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: row.color }}
                ></div>
                <span>{row.name}:</span>
              </div>
              <span className="font-medium">
                {row.value} ({percent(row.value)}%)
              </span>
            </div>
          ))}
        </div>

        {/* Enhanced Pie Chart */}
        <div className="w-24 h-24 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={20}
                outerRadius={40}
                dataKey="value"
                stroke="white"
                strokeWidth={2}
              >
                {chartData.map((row) => (
                  <Cell key={row.key} fill={row.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} (${percent(value)}%)`, name]}
                labelStyle={{ color: '#374151' }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total Images - Separate row */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 text-sm">
        <span className="font-medium text-gray-700">Total images:</span>
        <span className="font-semibold text-gray-900">{total}</span>
      </div>
    </div>
  );
};

export default DatasetAnnotationProgress;
