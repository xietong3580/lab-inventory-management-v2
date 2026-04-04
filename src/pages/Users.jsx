import { useState } from 'react';

function Users() {
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 模拟用户数据
  const users = [
    {
      id: 'user-001',
      username: 'admin',
      email: 'admin@example.com',
      role: '管理员',
      status: '活跃',
      lastLogin: '2026-03-29 15:30',
    },
    {
      id: 'user-002',
      username: 'zhang.san',
      email: 'zhang.san@example.com',
      role: '仓库管理员',
      status: '活跃',
      lastLogin: '2026-03-28 10:20',
    },
    {
      id: 'user-003',
      username: 'li.si',
      email: 'li.si@example.com',
      role: '操作员',
      status: '活跃',
      lastLogin: '2026-03-27 14:45',
    },
    {
      id: 'user-004',
      username: 'wang.wu',
      email: 'wang.wu@example.com',
      role: '查看者',
      status: '停用',
      lastLogin: '2026-03-20 09:15',
    },
    {
      id: 'user-005',
      username: 'zhao.liu',
      email: 'zhao.liu@example.com',
      role: '操作员',
      status: '活跃',
      lastLogin: '2026-03-29 11:10',
    },
  ];

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedUsers = users.slice(startIndex, endIndex);
  const totalPages = Math.ceil(users.length / itemsPerPage);

  // 角色标签组件
  function RoleBadge({ role }) {
    const config = {
      管理员: { bg: 'bg-slate-100', textColor: 'text-slate-800' },
      仓库管理员: { bg: 'bg-blue-50', textColor: 'text-blue-700' },
      操作员: { bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
      查看者: { bg: 'bg-slate-50', textColor: 'text-slate-600' },
    };
    const { bg, textColor } = config[role] || config.查看者;

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
        {role}
      </span>
    );
  }

  // 状态标签组件
  function StatusBadge({ status }) {
    const config = {
      活跃: { text: '活跃', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
      停用: { text: '停用', bg: 'bg-slate-100', textColor: 'text-slate-600' },
    };
    const { text, bg, textColor } = config[status] || config.停用;

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
        {text}
      </span>
    );
  }

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">用户管理</h1>
        <p className="text-slate-600 mt-1">
          管理系统用户账户、角色和权限。
        </p>
      </div>

      {/* 操作栏 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium">
            + 新增用户
          </button>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent w-full sm:w-64"
            />
            <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium w-full sm:w-auto">
              搜索
            </button>
          </div>
        </div>
      </div>

      {/* 用户表格 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[800px] md:min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  用户名
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  邮箱
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  角色
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  状态
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  最后登录
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{user.username}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{user.lastLogin}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                        编辑
                      </button>
                      <button className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors">
                        {user.status === '停用' ? '启用' : '停用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控制 */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
          <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
            显示第 {startIndex + 1} - {Math.min(endIndex, users.length)} 条，共 {users.length} 条记录
          </div>
          <div className="w-full md:w-auto flex justify-center flex-wrap items-center gap-2 whitespace-nowrap">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded border text-sm ${
                currentPage === 1
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              上一页
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      currentPage === pageNum
                        ? 'bg-slate-700 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && (
                <>
                  <span className="text-slate-400">...</span>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      currentPage === totalPages
                        ? 'bg-slate-700 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded border text-sm ${
                currentPage === totalPages
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：用户管理功能当前为占位界面。实际使用时，管理员可在此添加、编辑和停用用户账户，并分配相应角色权限。
        </div>
      </div>
    </div>
  );
}

export default Users;