import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 模拟登录过程 - 仅 UI 演示，不接入真实逻辑
    setIsSubmitting(true);

    // 模拟 API 调用延迟
    setTimeout(() => {
      setIsSubmitting(false);
      // 跳转到仪表盘（后续可改为真实鉴权）
      navigate('/dashboard');
    }, 800);
  };

  const isFormValid = formData.username.trim() !== '' && formData.password.trim() !== '';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 品牌展示区 */}
        <div className="text-center mb-10">
          {/* Logo 占位 */}
          <div className="w-16 h-16 bg-slate-200 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <div className="text-2xl font-bold text-slate-600">P</div>
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">PRONOVATION</h1>
          <p className="text-slate-600 mt-1">普诺实验商城 · 库存管理系统</p>
          <div className="text-sm text-slate-500 mt-3">V2.0 新版后台</div>
        </div>

        {/* 登录表单卡片 */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">
            用户登录
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名输入 */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                用户名
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-colors"
                placeholder="请输入用户名"
                autoComplete="username"
                required
              />
            </div>

            {/* 密码输入 */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                密码
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-colors"
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </div>

            {/* 辅助操作行 */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-slate-600 focus:ring-slate-500 border-slate-300 rounded"
                />
                <span className="ml-2 text-slate-600">记住登录状态</span>
              </label>
              <button
                type="button"
                className="text-slate-600 hover:text-slate-800 hover:underline"
              >
                忘记密码？
              </button>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`w-full py-2.5 px-4 rounded-md font-medium transition-colors ${
                isFormValid && !isSubmitting
                  ? 'bg-slate-700 text-white hover:bg-slate-800 active:bg-slate-900'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2">登录中</span>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                </span>
              ) : (
                '登录系统'
              )}
            </button>
          </form>

          {/* 底部提示 */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center">
              首次使用？请联系系统管理员获取账户。
              <br />
              此为独立新版系统，不影响现有旧版库存系统。
            </p>
          </div>
        </div>

        {/* 页脚 */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>© 2026 PRONOVATION 普诺实验商城. 库存自动化管理系统 V2</p>
          <p className="mt-1">仅供内部使用，请妥善保管账户信息。</p>
        </div>
      </div>
    </div>
  );
}

export default Login;