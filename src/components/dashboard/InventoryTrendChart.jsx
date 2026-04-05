import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function InventoryTrendChart({ data, timeRangeLabel = '当前时间范围' }) {
  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <div className="w-6 h-6 bg-slate-300 rounded"></div>
        </div>
        <div className="text-slate-400 mb-2">暂无库存趋势数据</div>
        <div className="text-sm text-slate-500 max-w-xs mx-auto">
          {timeRangeLabel}内无库存变化记录
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              // 格式化为 MM-DD
              const parts = value.split('-');
              if (parts.length >= 3) {
                return `${parts[1]}-${parts[2]}`;
              }
              return value;
            }}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            label={{
              value: '库存总量',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              style: { textAnchor: 'middle', fill: '#64748b' }
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              padding: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}
            formatter={(value) => [`${value} 件`, '库存总量']}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="totalStock"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ stroke: '#3b82f6', strokeWidth: 2, r: 3 }}
            activeDot={{ r: 6, stroke: '#1d4ed8', strokeWidth: 2 }}
            name="库存总量"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default InventoryTrendChart;