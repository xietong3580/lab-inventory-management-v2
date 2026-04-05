import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function RiskDistributionChart({ lowStockCount = 0, normalStockCount = 0, totalProducts = 0 }) {
  const data = [
    { name: '正常库存', value: normalStockCount, color: '#3b82f6' },
    { name: '低库存', value: lowStockCount, color: '#f59e0b' },
  ];

  // 过滤掉值为0的项，避免在图表中显示
  const filteredData = data.filter(item => item.value > 0);

  if (filteredData.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <div className="w-6 h-6 bg-slate-300 rounded"></div>
        </div>
        <div className="text-slate-400 mb-2">暂无库存风险分布数据</div>
        <div className="text-sm text-slate-500 max-w-xs mx-auto">
          当前无产品库存数据
        </div>
      </div>
    );
  }

  // 计算百分比
  const lowStockPercentage = totalProducts > 0 ? Math.round((lowStockCount / totalProducts) * 100) : 0;
  const normalStockPercentage = totalProducts > 0 ? Math.round((normalStockCount / totalProducts) * 100) : 0;

  return (
    <div className="w-full pb-4">
      {/* 图表区域 */}
      <div className="h-48 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filteredData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              outerRadius={60}
              fill="#8884d8"
              dataKey="value"
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                padding: '8px',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
              }}
              formatter={(value, name) => [`${value} 个产品`, name]}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} verticalAlign="bottom" align="center" />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 统计摘要 */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <div className="text-xs font-medium text-slate-700">正常库存</div>
            </div>
            <div className="text-lg font-semibold text-slate-800">{normalStockCount}</div>
            <div className="text-xs text-slate-500 mt-1">{normalStockPercentage}%</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <div className="text-xs font-medium text-slate-700">低库存</div>
            </div>
            <div className="text-lg font-semibold text-slate-800">{lowStockCount}</div>
            <div className="text-xs text-slate-500 mt-1">{lowStockPercentage}%</div>
          </div>
        </div>
        {lowStockCount > 0 && (
          <div className="mt-5 pt-3 text-center">
            <div className="text-xs text-slate-600">
              <span className="font-medium">库存健康度:</span>
              {lowStockPercentage <= 10 ? ' 良好' : lowStockPercentage <= 20 ? ' 一般' : ' 需关注'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RiskDistributionChart;