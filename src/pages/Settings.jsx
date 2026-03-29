function Settings() {
  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">系统设置</h1>
        <p className="text-slate-600 mt-1">
          配置系统参数、通知选项和品牌信息。
        </p>
      </div>

      {/* 设置卡片网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 库存预警设置 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">库存预警阈值</h2>
            <p className="text-sm text-slate-500 mt-1">设置库存预警的触发条件</p>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                紧急预警阈值
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="30"
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-800 w-12">30%</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">库存低于此百分比时触发紧急预警</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                中等预警阈值
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="60"
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-800 w-12">60%</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">库存低于此百分比时触发中等预警</p>
            </div>
          </div>
        </div>

        {/* 通知设置 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">通知设置</h2>
            <p className="text-sm text-slate-500 mt-1">配置系统通知选项</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">低库存预警通知</div>
                <div className="text-sm text-slate-500 mt-1">库存低于阈值时发送通知</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">每日库存报告</div>
                <div className="text-sm text-slate-500 mt-1">每日发送库存状态摘要</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">出入库记录通知</div>
                <div className="text-sm text-slate-500 mt-1">重要出入库操作时发送通知</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
          </div>
        </div>

        {/* 品牌信息设置 */}
        <div className="bg-white border border-slate-200 rounded-lg lg:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">品牌信息</h2>
            <p className="text-sm text-slate-500 mt-1">配置系统显示的品牌标识和信息</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  系统名称
                </label>
                <input
                  type="text"
                  defaultValue="库存自动化管理系统 V2"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  公司名称
                </label>
                <input
                  type="text"
                  defaultValue="PRONOVATION 普诺实验商城"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  系统描述
                </label>
                <textarea
                  rows="3"
                  defaultValue="独立新版库存管理系统，用于管理实验耗材、试剂和设备的库存，提供实时监控、预警和报表功能。"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-4">
                品牌颜色
              </label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-slate-700"></div>
                  <span className="text-sm text-slate-700">主色调</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-emerald-500"></div>
                  <span className="text-sm text-slate-700">成功色</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-rose-500"></div>
                  <span className="text-sm text-slate-700">警告色</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-amber-500"></div>
                  <span className="text-sm text-slate-700">注意色</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 系统维护 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">系统维护</h2>
            <p className="text-sm text-slate-500 mt-1">系统维护和操作选项</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <div className="font-medium text-slate-800 mb-2">数据备份</div>
                <p className="text-sm text-slate-600 mb-3">手动触发系统数据备份</p>
                <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium">
                  立即备份
                </button>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">系统日志</div>
                <p className="text-sm text-slate-600 mb-3">查看系统操作日志</p>
                <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium">
                  查看日志
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 关于系统 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">关于系统</h2>
            <p className="text-sm text-slate-500 mt-1">系统版本和信息</p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">系统版本</span>
                <span className="text-sm font-medium text-slate-800">V2.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">React 版本</span>
                <span className="text-sm font-medium text-slate-800">19.2.4</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">最后更新</span>
                <span className="text-sm font-medium text-slate-800">2026-03-29</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">技术支持</span>
                <span className="text-sm font-medium text-slate-800">tech@example.com</span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="text-sm text-slate-600">
                本系统为独立新版库存管理系统，不影响现有旧版系统运行。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="mt-8 p-6 bg-white border border-slate-200 rounded-lg">
        <div className="flex justify-end gap-4">
          <button className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium">
            恢复默认
          </button>
          <button className="px-6 py-2.5 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium">
            保存设置
          </button>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：系统设置功能当前为占位界面。实际使用时，管理员可在此配置系统参数、通知选项和品牌信息。修改设置后需点击“保存设置”生效。
        </div>
      </div>
    </div>
  );
}

export default Settings;