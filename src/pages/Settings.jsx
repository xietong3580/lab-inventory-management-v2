import { useState, useEffect } from 'react';
import { systemService } from '../services/dataService';
import { usePermission } from '../hooks/usePermission';
import { changePassword } from '../services/authService';
import { createManualBackup, getBackups, downloadBackup, formatBytes, runPreflightCheck, createMaintenanceBackup, getResetPreview, resetBusinessData, getRestoreCandidates, getRestorePreflight, prepareRestore } from '../services/backupService';
import GoLiveChecklistPanel from '../components/GoLiveChecklistPanel';
import SystemOperationGuide from '../components/SystemOperationGuide';

function Settings() {
  const { canWrite, adminOnlyTitle } = usePermission();
  // 重置相关状态
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  // 数据源模式状态
  const [dataSourceMode, setDataSourceMode] = useState('unknown');
  // 修改密码相关状态
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [isChangingPwd, setIsChangingPwd] = useState(false);
  // 备份相关状态
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState(null);
  // 备份列表相关状态
  const [backupList, setBackupList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  // 下载相关状态
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  // 安全检查相关状态
  const [preflightResult, setPreflightResult] = useState(null);
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState('');
  // 维护备份相关状态
  const [showBackupConfirm, setShowBackupConfirm] = useState(false);
  const [isMaintenanceBackup, setIsMaintenanceBackup] = useState(false);
  const [maintBackupResult, setMaintBackupResult] = useState(null);
  // 清空预览相关状态
  const [resetPreviewResult, setResetPreviewResult] = useState(null);
  const [isLoadingResetPreview, setIsLoadingResetPreview] = useState(false);
  const [resetPreviewError, setResetPreviewError] = useState('');
  // 清空测试业务数据相关状态
  const [resetBusinessConfirmText, setResetBusinessConfirmText] = useState('');
  const [isResettingBusiness, setIsResettingBusiness] = useState(false);
  const [resetBusinessResult, setResetBusinessResult] = useState(null);
  const [resetBusinessError, setResetBusinessError] = useState('');
  // Step 10-7A：恢复预检相关状态
  const [restoreCandidates, setRestoreCandidates] = useState([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState('');
  const [restorePreflightResult, setRestorePreflightResult] = useState(null);
  const [isRunningPreflight, setIsRunningPreflight] = useState(false);
  const [preflightingFile, setPreflightingFile] = useState(null);
  const [restorePreflightError, setRestorePreflightError] = useState('');
  // Step 10-7B：恢复准备相关状态
  const [isPreparingRestore, setIsPreparingRestore] = useState(false);
  const [preparingFile, setPreparingFile] = useState(null);
  const [restorePlan, setRestorePlan] = useState(null);
  const [restorePlanError, setRestorePlanError] = useState('');

  // 获取数据源模式
  useEffect(() => {
    const mode = systemService.getDataSourceMode();
    setDataSourceMode(mode);
  }, []);

  // 加载备份文件列表（仅管理员）
  const loadBackupList = async () => {
    if (!canWrite) return;
    setIsLoadingList(true);
    setListError('');
    try {
      const data = await getBackups();
      setBackupList(data.items || []);
    } catch (err) {
      setListError(err.message || '加载备份列表失败');
      setBackupList([]);
    } finally {
      setIsLoadingList(false);
    }
  };

  // admin 进入页面时自动加载备份列表
  useEffect(() => {
    if (canWrite) {
      loadBackupList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  // Step 10-7A：加载恢复候选列表（仅管理员）
  const loadRestoreCandidates = async () => {
    if (!canWrite) return;
    setIsLoadingCandidates(true);
    setCandidatesError('');
    try {
      const data = await getRestoreCandidates();
      setRestoreCandidates(data.candidates || []);
    } catch (err) {
      setCandidatesError(err.message || '加载恢复候选列表失败');
      setRestoreCandidates([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  // admin 进入页面时自动加载恢复候选列表
  useEffect(() => {
    if (canWrite) {
      loadRestoreCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  // Step 10-7A：对指定备份文件执行恢复预检
  const handleRestorePreflight = async (filename) => {
    setPreflightingFile(filename);
    setIsRunningPreflight(true);
    setRestorePreflightResult(null);
    setRestorePreflightError('');
    setRestorePlan(null);  // 清除上次的恢复计划
    setRestorePlanError('');
    try {
      const result = await getRestorePreflight(filename);
      setRestorePreflightResult(result);
    } catch (err) {
      setRestorePreflightError(err.message || '恢复预检失败');
    } finally {
      setIsRunningPreflight(false);
      setPreflightingFile(null);
    }
  };

  // Step 10-7B：执行恢复前准备（创建恢复前备份，不执行真实恢复）
  const handlePrepareRestore = async (filename) => {
    setPreparingFile(filename);
    setIsPreparingRestore(true);
    setRestorePlan(null);
    setRestorePlanError('');
    try {
      const result = await prepareRestore(filename);
      setRestorePlan(result);
    } catch (err) {
      setRestorePlanError(err.message || '恢复准备失败');
    } finally {
      setIsPreparingRestore(false);
      setPreparingFile(null);
    }
  };

  // 打开重置确认对话框
  const handleOpenResetConfirm = () => {
    setShowResetConfirm(true);
    setResetResult(null);
  };

  // 关闭重置确认对话框
  const handleCloseResetConfirm = () => {
    setShowResetConfirm(false);
    setResetResult(null);
  };

  // 确认执行重置
  const handleConfirmReset = async () => {
    setIsResetting(true);
    setResetResult(null);

    try {
      // 执行重置操作（根据数据源模式执行不同逻辑）
      const result = await systemService.resetData();
      setResetResult(result);

      // 重置成功后刷新页面（仅mock模式成功时）
      if (result.success && dataSourceMode === 'mock') {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      setResetResult({
        success: false,
        message: error.message || '重置操作执行失败'
      });
    } finally {
      setIsResetting(false);
    }
  };

  // 修改密码表单变化
  const handlePwdChange = (field, value) => {
    setPwdForm(prev => ({ ...prev, [field]: value }));
    setPwdError('');
    setPwdSuccess('');
  };

  // 提交修改密码
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    // 前端校验
    if (!pwdForm.oldPassword.trim()) {
      setPwdError('请输入当前密码');
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdError('新密码不能少于 6 位');
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError('两次新密码输入不一致');
      return;
    }

    setIsChangingPwd(true);
    try {
      await changePassword(pwdForm.oldPassword, pwdForm.newPassword);
      setPwdSuccess('密码修改成功，请牢记新密码');
      setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwdError(err.message || '密码修改失败，请检查当前密码后重试');
    } finally {
      setIsChangingPwd(false);
    }
  };

  // 执行手动备份
  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupResult(null);

    try {
      const result = await createManualBackup();
      setBackupResult(result);
      // 备份成功后自动刷新列表
      if (result.success) {
        loadBackupList();
      }
    } catch (err) {
      setBackupResult({
        success: false,
        message: err.message || '备份操作执行失败',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  // 下载备份文件
  const handleDownload = async (filename) => {
    if (downloadingFile) return; // 防止重复点击
    setDownloadingFile(filename);
    setDownloadError('');
    try {
      const blob = await downloadBackup(filename);
      // 创建 Blob 下载链接
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message || '下载备份文件失败');
    } finally {
      setDownloadingFile(null);
    }
  };

  // 运行安全检查
  const handlePreflightCheck = async () => {
    setIsCheckingPreflight(true);
    setPreflightResult(null);
    setPreflightError('');
    try {
      const result = await runPreflightCheck();
      setPreflightResult(result);
    } catch (err) {
      setPreflightError(err.message || '安全检查请求失败');
    } finally {
      setIsCheckingPreflight(false);
    }
  };

  // 打开维护备份确认
  const handleOpenMaintenanceBackupConfirm = () => {
    setShowBackupConfirm(true);
    setMaintBackupResult(null);
  };

  // 关闭维护备份确认
  const handleCloseMaintenanceBackupConfirm = () => {
    setShowBackupConfirm(false);
    setMaintBackupResult(null);
  };

  // 确认创建维护备份
  const handleConfirmMaintenanceBackup = async () => {
    setIsMaintenanceBackup(true);
    setMaintBackupResult(null);
    try {
      const result = await createMaintenanceBackup();
      setMaintBackupResult(result);
      if (result.success) {
        loadBackupList();
      }
    } catch (err) {
      setMaintBackupResult({
        success: false,
        message: err.message || '创建备份失败',
      });
    } finally {
      setIsMaintenanceBackup(false);
    }
  };

  // 查看清空预览
  const handleResetPreview = async () => {
    setIsLoadingResetPreview(true);
    setResetPreviewResult(null);
    setResetPreviewError('');
    try {
      const result = await getResetPreview();
      setResetPreviewResult(result);
    } catch (err) {
      setResetPreviewError(err.message || '清空预览请求失败');
    } finally {
      setIsLoadingResetPreview(false);
    }
  };

  // 执行清空测试业务数据
  const handleResetBusinessData = async () => {
    // 浏览器二次确认
    const confirmed = window.confirm(
      '⚠️ 危险操作确认\n\n' +
      '即将清空当前系统中的所有测试业务数据，包括：\n' +
      '• 产品与库存数据\n' +
      '• 出入库记录\n' +
      '• 库存台账\n' +
      '• 审计日志\n\n' +
      '系统会先自动创建数据库备份，成功后才执行清空。\n' +
      '用户账号、系统设置和备份文件不会被清空。\n\n' +
      '此操作不可撤销，确定要继续吗？'
    );
    if (!confirmed) return;

    setIsResettingBusiness(true);
    setResetBusinessResult(null);
    setResetBusinessError('');
    try {
      const result = await resetBusinessData(resetBusinessConfirmText);
      setResetBusinessResult(result);
      // 清空成功后刷新预览
      if (result.success) {
        handleResetPreview();
        loadBackupList();
      }
    } catch (err) {
      setResetBusinessError(err.message || '清空操作失败');
    } finally {
      setIsResettingBusiness(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">系统设置</h1>
        <p className="text-slate-600 mt-1">
          配置系统参数、通知选项和品牌信息。
        </p>
      </div>

      {/* 设置卡片区 */}
      <div className="space-y-6">
        {/* 库存预警设置 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">库存预警阈值</h2>
            <p className="text-sm text-slate-500 mt-1">设置库存预警的触发条件</p>
          </div>
          <div className="p-4 md:p-6 space-y-5">
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
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`w-full h-2 bg-slate-200 rounded-lg appearance-none ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
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
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`w-full h-2 bg-slate-200 rounded-lg appearance-none ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
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
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">低库存预警通知</div>
                <div className="text-sm text-slate-500 mt-1">库存低于阈值时发送通知</div>
              </div>
              <label className={`relative inline-flex items-center ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`} title={!canWrite ? adminOnlyTitle : ''}>
                <input type="checkbox" className="sr-only peer" defaultChecked disabled={!canWrite} />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">每日库存报告</div>
                <div className="text-sm text-slate-500 mt-1">每日发送库存状态摘要</div>
              </div>
              <label className={`relative inline-flex items-center ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`} title={!canWrite ? adminOnlyTitle : ''}>
                <input type="checkbox" className="sr-only peer" disabled={!canWrite} />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">出入库记录通知</div>
                <div className="text-sm text-slate-500 mt-1">重要出入库操作时发送通知</div>
              </div>
              <label className={`relative inline-flex items-center ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`} title={!canWrite ? adminOnlyTitle : ''}>
                <input type="checkbox" className="sr-only peer" defaultChecked disabled={!canWrite} />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
              </label>
            </div>
          </div>
        </div>

        {/* 品牌信息设置 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">品牌信息</h2>
            <p className="text-sm text-slate-500 mt-1">配置系统显示的品牌标识和信息</p>
          </div>
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  系统名称
                </label>
                <input
                  type="text"
                  defaultValue="库存自动化管理系统 V2"
                  readOnly={!canWrite}
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent ${
                    !canWrite ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  公司名称
                </label>
                <input
                  type="text"
                  defaultValue="PRONOVATION 普诺实验商城"
                  readOnly={!canWrite}
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent ${
                    !canWrite ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''
                  }`}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  系统描述
                </label>
                <textarea
                  rows="3"
                  defaultValue="独立新版库存管理系统，用于管理实验耗材、试剂和设备的库存，提供实时监控、预警和报表功能。"
                  readOnly={!canWrite}
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent resize-none ${
                    !canWrite ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''
                  }`}
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
          <div className="p-4 md:p-6">
            <div className="space-y-4">
              {/* ── 数据安全与备份 ── */}
              <div>
                <div className="font-medium text-slate-800 mb-2">数据安全检查</div>
                <p className="text-sm text-slate-600 mb-3">在创建备份或导出数据前，先检查数据库完整性</p>
                <button
                  onClick={handlePreflightCheck}
                  disabled={isCheckingPreflight}
                  className={`px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium ${
                    isCheckingPreflight ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isCheckingPreflight ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
                      检查中...
                    </span>
                  ) : (
                    '运行安全检查'
                  )}
                </button>
                {/* 检查错误 */}
                {preflightError && (
                  <div className="mt-3 p-3 rounded-md border text-sm bg-rose-50 border-rose-200">
                    <span className="text-rose-700">{preflightError}</span>
                  </div>
                )}
                {/* 检查结果 */}
                {preflightResult && (
                  <div className={`mt-3 p-3 rounded-md border text-sm ${
                    preflightResult.status === 'ok'
                      ? 'bg-emerald-50 border-emerald-200'
                      : preflightResult.status === 'warning'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className={`font-medium mb-2 ${
                      preflightResult.status === 'ok'
                        ? 'text-emerald-800'
                        : preflightResult.status === 'warning'
                        ? 'text-amber-800'
                        : 'text-rose-800'
                    }`}>
                      {preflightResult.status === 'ok' && '✅ 检查通过'}
                      {preflightResult.status === 'warning' && '⚠️ 存在警告，请确认后再导出/备份'}
                      {preflightResult.status === 'error' && '❌ 存在错误，请先处理'}
                    </div>
                    <div className="space-y-1.5 text-slate-700">
                      {/* 数据库状态 */}
                      <div className="flex gap-2">
                        <span className="text-slate-500 shrink-0">数据库：</span>
                        <span>
                          {preflightResult.database_exists && preflightResult.database_readable
                            ? '正常'
                            : preflightResult.database_exists
                            ? '文件存在但不可读'
                            : '文件不存在'}
                        </span>
                      </div>
                      {/* 备份目录状态 */}
                      <div className="flex gap-2">
                        <span className="text-slate-500 shrink-0">备份目录：</span>
                        <span className={preflightResult.backup_dir_writable ? 'text-emerald-700' : 'text-rose-700'}>
                          {preflightResult.backup_dir_writable ? '可写' : '不可写'}
                        </span>
                      </div>
                      {/* 数据统计 */}
                      <div className="flex gap-2">
                        <span className="text-slate-500 shrink-0">产品数量：</span>
                        <span>{preflightResult.products_count}</span>
                        <span className="text-slate-400 mx-1">|</span>
                        <span className="text-slate-500">交易数量：</span>
                        <span>{preflightResult.transactions_count}</span>
                        <span className="text-slate-400 mx-1">|</span>
                        <span className="text-slate-500">审计日志：</span>
                        <span>{preflightResult.audit_logs_count}</span>
                      </div>
                      {/* 异常项 */}
                      {(preflightResult.negative_stock_count > 0 ||
                        preflightResult.transactions_missing_product_id_count > 0 ||
                        preflightResult.transactions_orphan_product_id_count > 0 ||
                        preflightResult.duplicate_sku_count > 0) && (
                        <div className="flex gap-2 mt-1">
                          <span className="text-slate-500 shrink-0">异常项：</span>
                          <span className="text-rose-700">
                            {[
                              preflightResult.negative_stock_count > 0 && `负库存 ${preflightResult.negative_stock_count}`,
                              preflightResult.transactions_missing_product_id_count > 0 && `缺productId ${preflightResult.transactions_missing_product_id_count}`,
                              preflightResult.transactions_orphan_product_id_count > 0 && `孤立productId ${preflightResult.transactions_orphan_product_id_count}`,
                              preflightResult.duplicate_sku_count > 0 && `重复SKU ${preflightResult.duplicate_sku_count}`,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Warnings */}
                    {preflightResult.warnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-200">
                        <div className="text-xs font-medium text-amber-700 mb-1">警告信息：</div>
                        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                          {preflightResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Errors */}
                    {preflightResult.errors.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-rose-200">
                        <div className="text-xs font-medium text-rose-700 mb-1">错误信息：</div>
                        <ul className="text-xs text-rose-700 space-y-0.5 list-disc list-inside">
                          {preflightResult.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {/* 创建数据库备份按钮（含二次确认） */}
                <div className="mt-3">
                  <button
                    onClick={handleOpenMaintenanceBackupConfirm}
                    disabled={!canWrite || isMaintenanceBackup}
                    title={!canWrite ? adminOnlyTitle : (isMaintenanceBackup ? '备份进行中...' : '创建数据库物理备份文件')}
                    className={`px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium ${
                      !canWrite || isMaintenanceBackup ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isMaintenanceBackup ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        备份中...
                      </span>
                    ) : (
                      '创建数据库备份'
                    )}
                  </button>
                  {!canWrite && (
                    <span className="ml-2 text-xs text-slate-400">仅管理员可操作</span>
                  )}
                </div>
                {/* 维护备份结果 */}
                {maintBackupResult && (
                  <div className={`mt-3 p-3 rounded-md border text-sm ${
                    maintBackupResult.success
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className={`font-medium mb-1 ${maintBackupResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {maintBackupResult.success ? '✅ 备份成功' : '❌ 备份失败'}
                    </div>
                    {maintBackupResult.success ? (
                      <div className="space-y-1 text-slate-700">
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">文件：</span>
                          <span className="font-mono text-xs break-all">{maintBackupResult.filename}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">大小：</span>
                          <span>{formatBytes(maintBackupResult.size_bytes)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">时间：</span>
                          <span>{new Date(maintBackupResult.created_at).toLocaleString('zh-CN')}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-rose-700">{maintBackupResult.message}</div>
                    )}
                  </div>
                )}
              </div>
              {/* ── 正式导入前清空预览 ── */}
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">正式导入前清空预览</div>
                <p className="text-sm text-slate-600 mb-3">
                  当前系统内产品、库存、出入库和日志均视为测试业务数据。正式导入旧系统真实数据前，应先备份并按流程清空测试业务数据。本功能仅预览数量，不会删除或修改任何数据。
                </p>
                <button
                  onClick={handleResetPreview}
                  disabled={isLoadingResetPreview}
                  className={`px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium ${
                    isLoadingResetPreview ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoadingResetPreview ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
                      加载中...
                    </span>
                  ) : (
                    '查看清空预览'
                  )}
                </button>
                {/* 清空预览错误 */}
                {resetPreviewError && (
                  <div className="mt-3 p-3 rounded-md border text-sm bg-rose-50 border-rose-200">
                    <span className="text-rose-700">{resetPreviewError}</span>
                  </div>
                )}
                {/* 清空预览结果 */}
                {resetPreviewResult && resetPreviewResult.success && (
                  <div className="mt-3 space-y-3">
                    {/* 将清空的数据 */}
                    <div>
                      <div className="text-sm font-medium text-rose-700 mb-2">将清空的数据</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {resetPreviewResult.will_clear.map((item) => (
                          <div key={item.key} className="p-3 rounded-md border border-rose-200 bg-rose-50">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium text-slate-800">{item.name}</span>
                              <span className="text-lg font-semibold text-rose-700">{item.count}</span>
                            </div>
                            <div className="text-xs text-slate-500">{item.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 将保留的数据 */}
                    <div>
                      <div className="text-sm font-medium text-emerald-700 mb-2">将保留的数据</div>
                      <div className="space-y-2">
                        {resetPreviewResult.will_keep.map((item) => (
                          <div key={item.key} className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="text-emerald-500 mt-0.5">✓</span>
                            <span>
                              <span className="font-medium text-slate-700">{item.name}</span>
                              &nbsp;— {item.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 概要统计 */}
                    <div className="p-3 rounded-md border border-slate-200 bg-slate-50">
                      <div className="text-xs text-slate-500 mb-1">数据概要</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                        <span>产品 {resetPreviewResult.summary.products}</span>
                        <span>出入库 {resetPreviewResult.summary.transactions}</span>
                        <span>台账 {resetPreviewResult.summary.ledger_records}</span>
                        <span>审计日志 {resetPreviewResult.summary.audit_logs}</span>
                        <span>低库存 {resetPreviewResult.summary.low_stock_products}</span>
                      </div>
                    </div>
                    {/* 警告提示 */}
                    {resetPreviewResult.warnings && resetPreviewResult.warnings.length > 0 && (
                      <div className="p-3 rounded-md border bg-amber-50 border-amber-200">
                        <div className="text-xs font-medium text-amber-700 mb-1">提示</div>
                        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                          {resetPreviewResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* ── 清空测试业务数据（admin 危险操作区）── */}
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">清空测试业务数据</div>
                <p className="text-sm text-slate-600 mb-3">
                  该操作会清空当前系统中的产品、库存、出入库记录、台账和测试审计日志。系统会先创建数据库备份，成功后才执行清空。用户账号、系统设置和备份文件不会被清空。
                </p>
                {canWrite ? (
                  <>
                    {/* 危险提示卡片 */}
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-md mb-4">
                      <div className="flex items-start">
                        <div className="shrink-0 mr-3 mt-0.5">
                          <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-rose-600">!</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-rose-800 mb-1">危险操作</div>
                          <div className="text-sm text-rose-700">
                            此操作会清空测试业务数据，不可撤销。请确认已准备好旧系统真实数据用于后续导入。
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* 确认短语输入 */}
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        请输入确认短语
                      </label>
                      <input
                        type="text"
                        value={resetBusinessConfirmText}
                        onChange={(e) => {
                          setResetBusinessConfirmText(e.target.value);
                          setResetBusinessError('');
                        }}
                        placeholder="清空测试业务数据"
                        disabled={isResettingBusiness}
                        className={`w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent font-medium ${
                          isResettingBusiness ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
                        }`}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        请输入：清空测试业务数据
                      </p>
                    </div>
                    {/* 执行按钮 */}
                    <button
                      onClick={handleResetBusinessData}
                      disabled={resetBusinessConfirmText !== '清空测试业务数据' || isResettingBusiness}
                      title={
                        resetBusinessConfirmText !== '清空测试业务数据'
                          ? '请先输入正确的确认短语'
                          : isResettingBusiness
                          ? '清空操作进行中...'
                          : '备份并清空测试业务数据'
                      }
                      className={`px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors font-medium ${
                        resetBusinessConfirmText !== '清空测试业务数据' || isResettingBusiness
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      {isResettingBusiness ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          清空中...
                        </span>
                      ) : (
                        '备份并清空测试业务数据'
                      )}
                    </button>
                    {/* 错误提示 */}
                    {resetBusinessError && (
                      <div className="mt-3 p-3 rounded-md border text-sm bg-rose-50 border-rose-200">
                        <span className="text-rose-700">{resetBusinessError}</span>
                      </div>
                    )}
                    {/* 执行结果 */}
                    {resetBusinessResult && resetBusinessResult.success && (
                      <div className="mt-3 space-y-3">
                        {/* 备份信息 */}
                        <div className="p-3 rounded-md border border-emerald-200 bg-emerald-50">
                          <div className="text-sm font-medium text-emerald-800 mb-1">✅ 测试业务数据已清空</div>
                          <div className="space-y-1 text-sm text-slate-700">
                            <div className="flex gap-2">
                              <span className="text-slate-500 shrink-0">备份文件：</span>
                              <span className="font-mono text-xs break-all">{resetBusinessResult.backup.filename}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-slate-500 shrink-0">备份大小：</span>
                              <span>{formatBytes(resetBusinessResult.backup.size_bytes)}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-slate-500 shrink-0">备份时间：</span>
                              <span>{new Date(resetBusinessResult.backup.created_at).toLocaleString('zh-CN')}</span>
                            </div>
                          </div>
                        </div>
                        {/* 清空前/后对比 */}
                        <div className="p-3 rounded-md border border-slate-200 bg-slate-50">
                          <div className="text-xs text-slate-500 mb-2">数据变化</div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="text-slate-500">类别</div>
                            <div className="text-slate-500 text-right">清空前</div>
                            <div className="text-slate-500 text-right">清空后</div>
                            {['products', 'transactions', 'ledger_records', 'audit_logs', 'low_stock_products'].map((key) => (
                              <>
                                <div className="text-slate-700">{{
                                  products: '产品', transactions: '出入库', ledger_records: '台账',
                                  audit_logs: '审计日志', low_stock_products: '低库存',
                                }[key]}</div>
                                <div className="text-rose-700 text-right font-medium">{resetBusinessResult.before[key]}</div>
                                <div className="text-emerald-700 text-right font-medium">{resetBusinessResult.after[key]}</div>
                              </>
                            ))}
                          </div>
                        </div>
                        {/* Preflight 状态 */}
                        {resetBusinessResult.preflight && (
                          <div className={`p-3 rounded-md border text-sm ${
                            resetBusinessResult.preflight.status === 'ok'
                              ? 'bg-emerald-50 border-emerald-200'
                              : resetBusinessResult.preflight.status === 'warning'
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-rose-50 border-rose-200'
                          }`}>
                            <div className={`font-medium mb-1 ${
                              resetBusinessResult.preflight.status === 'ok'
                                ? 'text-emerald-800'
                                : resetBusinessResult.preflight.status === 'warning'
                                ? 'text-amber-800'
                                : 'text-rose-800'
                            }`}>
                              {resetBusinessResult.preflight.status === 'ok' && '✅ 清空后检查通过'}
                              {resetBusinessResult.preflight.status === 'warning' && '⚠️ 清空后存在警告'}
                              {resetBusinessResult.preflight.status === 'error' && '❌ 清空后存在错误'}
                            </div>
                            <div className="text-xs text-slate-600 space-y-0.5">
                              <div>产品 {resetBusinessResult.preflight.products_count} · 交易 {resetBusinessResult.preflight.transactions_count} · 审计日志 {resetBusinessResult.preflight.audit_logs_count}</div>
                              {resetBusinessResult.preflight.warnings.length > 0 && (
                                <div className="text-amber-700">
                                  {resetBusinessResult.preflight.warnings.join('；')}
                                </div>
                              )}
                              {resetBusinessResult.preflight.errors.length > 0 && (
                                <div className="text-rose-700">
                                  {resetBusinessResult.preflight.errors.join('；')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* 系统提示 */}
                        {resetBusinessResult.warnings && resetBusinessResult.warnings.length > 0 && (
                          <div className="p-3 rounded-md border bg-amber-50 border-amber-200">
                            <div className="text-xs font-medium text-amber-700 mb-1">提示</div>
                            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                              {resetBusinessResult.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* 刷新提示 */}
                        <p className="text-xs text-slate-500">
                          提示：清空完成后可刷新页面查看最新的产品列表和仪表盘状态。
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  /* viewer 只读提示 */
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="flex items-start">
                      <div className="shrink-0 mr-3 mt-0.5">
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700 mb-1">只读权限</div>
                        <div className="text-sm text-slate-600">
                          当前账号仅可查看清空范围，不能执行清空操作。
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">数据备份</div>
                <p className="text-sm text-slate-600 mb-3">手动触发系统数据备份</p>
                <button
                  onClick={handleBackup}
                  disabled={!canWrite || isBackingUp}
                  title={!canWrite ? adminOnlyTitle : (isBackingUp ? '备份进行中...' : '')}
                  className={`px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium ${
                    !canWrite || isBackingUp ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isBackingUp ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      备份中...
                    </span>
                  ) : (
                    '立即备份'
                  )}
                </button>
                {/* 备份结果 */}
                {backupResult && (
                  <div className={`mt-3 p-3 rounded-md border text-sm ${
                    backupResult.success
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className={`font-medium mb-1 ${backupResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {backupResult.success ? '✅ 备份成功' : '❌ 备份失败'}
                    </div>
                    {backupResult.success ? (
                      <div className="space-y-1 text-slate-700">
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">文件：</span>
                          <span className="font-mono text-xs break-all">{backupResult.filename}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">大小：</span>
                          <span>{formatBytes(backupResult.size_bytes)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">时间：</span>
                          <span>{new Date(backupResult.created_at).toLocaleString('zh-CN')}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0">校验：</span>
                          <span className={backupResult.integrity_check === 'ok' ? 'text-emerald-700 font-medium' : 'text-rose-700'}>
                            {backupResult.integrity_check === 'ok' ? '通过' : backupResult.integrity_check}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-rose-700">{backupResult.message}</div>
                    )}
                  </div>
                )}
                {/* 备份文件列表 */}
                {canWrite && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="font-medium text-slate-800 text-sm mb-2">备份记录</div>
                    {isLoadingList && (
                      <div className="text-sm text-slate-500 py-2">正在加载备份记录...</div>
                    )}
                    {listError && !isLoadingList && (
                      <div className="text-sm text-rose-600 py-2">{listError}</div>
                    )}
                    {downloadError && !isLoadingList && (
                      <div className="text-sm text-rose-600 py-2">{downloadError}</div>
                    )}
                    {!isLoadingList && !listError && backupList.length === 0 && (
                      <div className="text-sm text-slate-400 py-2">暂无备份记录</div>
                    )}
                    {!isLoadingList && backupList.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {backupList.map((item) => (
                          <div key={item.filename} className="flex items-center justify-between py-1.5 px-2 bg-slate-50 border border-slate-100 rounded text-xs">
                            <div className="min-w-0 flex-1 mr-2">
                              <div className="font-mono text-slate-700 truncate">{item.filename}</div>
                              <div className="text-slate-500 mt-0.5">
                                {formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleString('zh-CN')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleDownload(item.filename)}
                                disabled={downloadingFile === item.filename}
                                title={downloadingFile === item.filename ? '下载中...' : '下载备份文件'}
                                className="px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {downloadingFile === item.filename ? '下载中...' : '下载'}
                              </button>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                item.integrity_check === 'ok'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}>
                                {item.integrity_check === 'ok' ? '通过' : '异常'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!canWrite && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="text-sm text-slate-400 py-2">仅管理员可查看备份记录</div>
                  </div>
                )}
              </div>
              {/* Step 10-7A：数据库备份恢复预检（只读） */}
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">数据库备份恢复预检</div>
                <p className="text-sm text-slate-600 mb-3">
                  此功能仅检查备份文件是否可用于未来恢复，不会覆盖当前数据库。
                </p>
                {canWrite ? (
                  <>
                    {/* 恢复候选列表 */}
                    {isLoadingCandidates ? (
                      <div className="text-sm text-slate-500 py-2">正在加载恢复候选列表...</div>
                    ) : candidatesError && !isLoadingCandidates ? (
                      <div className="text-sm text-rose-600 py-2">{candidatesError}</div>
                    ) : restoreCandidates.length === 0 ? (
                      <div className="text-sm text-slate-400 py-2">暂无备份恢复候选文件</div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {restoreCandidates.map((candidate) => (
                          <div key={candidate.filename} className="py-2 px-3 bg-slate-50 border border-slate-100 rounded text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-slate-700 truncate flex-1 mr-2">{candidate.filename}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                                candidate.is_candidate
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}>
                                {candidate.is_candidate ? '可用' : '不可用'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="text-slate-500">
                                {formatBytes(candidate.size_bytes)} · {candidate.extension} · {new Date(candidate.created_at).toLocaleString('zh-CN')}
                              </div>
                              <button
                                onClick={() => handleRestorePreflight(candidate.filename)}
                                disabled={isRunningPreflight || !candidate.is_candidate}
                                title={!candidate.is_candidate ? '该备份不可用于恢复' : (isRunningPreflight ? '预检进行中...' : '运行恢复预检')}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                  isRunningPreflight || !candidate.is_candidate
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-slate-600 text-white hover:bg-slate-700'
                                }`}
                              >
                                {preflightingFile === candidate.filename ? (
                                  <span className="flex items-center gap-1">
                                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    预检中...
                                  </span>
                                ) : '预检'}
                              </button>
                            </div>
                            {candidate.warnings && candidate.warnings.length > 0 && (
                              <div className="mt-1 text-amber-600">
                                {candidate.warnings.map((w, i) => (
                                  <div key={i}>{w}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 恢复预检结果 */}
                    {restorePreflightError && (
                      <div className="mt-3 p-3 rounded-md border bg-rose-50 border-rose-200">
                        <div className="text-rose-800 font-medium mb-1">预检失败</div>
                        <div className="text-sm text-rose-700">{restorePreflightError}</div>
                      </div>
                    )}
                    {restorePreflightResult && (
                      <div className={`mt-3 p-3 rounded-md border text-sm ${
                        restorePreflightResult.level === 'ok'
                          ? 'bg-emerald-50 border-emerald-200'
                          : restorePreflightResult.level === 'warning'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-rose-50 border-rose-200'
                      }`}>
                        <div className={`font-medium mb-2 ${
                          restorePreflightResult.level === 'ok'
                            ? 'text-emerald-800'
                            : restorePreflightResult.level === 'warning'
                            ? 'text-amber-800'
                            : 'text-rose-800'
                        }`}>
                          {restorePreflightResult.level === 'ok' && '✅ 预检通过'}
                          {restorePreflightResult.level === 'warning' && '⚠️ 预检通过（有警告）'}
                          {restorePreflightResult.level === 'error' && '❌ 预检失败'}
                          <span className="font-normal text-slate-600 ml-2">
                            — {restorePreflightResult.filename} ({formatBytes(restorePreflightResult.size_bytes)})
                          </span>
                        </div>

                        {/* 检查项 */}
                        <div className="space-y-1 mb-3">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">检查项</div>
                          {restorePreflightResult.checks.map((check, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className={`mt-0.5 ${check.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {check.passed ? '✓' : '✗'}
                              </span>
                              <div>
                                <span className="text-slate-700">{check.name}</span>
                                <span className="text-slate-500 ml-2">{check.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 数据统计 */}
                        {restorePreflightResult.counts && (
                          <div className="mb-3 pt-2 border-t border-slate-200">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">备份数据概览</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                              <span>产品：{restorePreflightResult.counts.products_count ?? '—'}</span>
                              <span>出入库记录：{restorePreflightResult.counts.transactions_count ?? '—'}</span>
                              <span>审计日志：{restorePreflightResult.counts.audit_logs_count ?? '—'}</span>
                              <span>用户：{restorePreflightResult.counts.users_count ?? '—'}</span>
                            </div>
                          </div>
                        )}

                        {/* Warnings / Errors */}
                        {restorePreflightResult.warnings && restorePreflightResult.warnings.length > 0 && (
                          <div className="mb-2 pt-2 border-t border-amber-200">
                            <div className="text-xs font-medium text-amber-700 mb-1">警告</div>
                            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                              {restorePreflightResult.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {restorePreflightResult.errors && restorePreflightResult.errors.length > 0 && (
                          <div className="pt-2 border-t border-rose-200">
                            <div className="text-xs font-medium text-rose-700 mb-1">错误</div>
                            <ul className="text-xs text-rose-700 space-y-0.5 list-disc list-inside">
                              {restorePreflightResult.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 10-7B：准备恢复按钮（仅预检通过 ok/warning 时显示） */}
                    {restorePreflightResult && (restorePreflightResult.level === 'ok' || restorePreflightResult.level === 'warning') && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-slate-600">
                            预检{restorePreflightResult.level === 'ok' ? '通过' : '通过（有警告）'}，可准备恢复
                          </div>
                          <button
                            onClick={() => handlePrepareRestore(restorePreflightResult.filename)}
                            disabled={isPreparingRestore}
                            title={isPreparingRestore ? '准备中...' : '创建恢复前备份并生成恢复计划'}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              isPreparingRestore
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                : 'bg-slate-600 text-white hover:bg-slate-700'
                            }`}
                          >
                            {preparingFile === restorePreflightResult.filename && isPreparingRestore ? (
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                准备中...
                              </span>
                            ) : '准备恢复'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 10-7B：恢复准备错误 */}
                    {restorePlanError && (
                      <div className="mt-3 p-3 rounded-md border bg-rose-50 border-rose-200">
                        <div className="text-rose-800 font-medium mb-1">恢复准备失败</div>
                        <div className="text-sm text-rose-700">{restorePlanError}</div>
                      </div>
                    )}

                    {/* Step 10-7B：恢复计划卡片 */}
                    {restorePlan && (
                      <div className="mt-3 p-4 rounded-md border bg-blue-50 border-blue-200 text-sm">
                        <div className="text-blue-800 font-medium mb-3">📋 恢复计划</div>

                        {/* 目标备份 */}
                        <div className="mb-3">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">目标备份文件</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                            <span className="font-mono">{restorePlan.target_backup_filename}</span>
                            <span>{formatBytes(restorePlan.target_size_bytes)}</span>
                          </div>
                        </div>

                        {/* 恢复前备份 */}
                        <div className="mb-3 pt-3 border-t border-blue-200">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">恢复前自动备份（安全网）</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                            <span className="font-mono text-emerald-700">{restorePlan.pre_restore_backup_filename}</span>
                            <span className="text-emerald-700">{formatBytes(restorePlan.pre_restore_backup_size_bytes)}</span>
                          </div>
                        </div>

                        {/* 数据对比 */}
                        <div className="mb-3 pt-3 border-t border-blue-200">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">数据对比</div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-slate-500">指标</div>
                            <div className="text-slate-500 text-center">当前数据库</div>
                            <div className="text-slate-500 text-center">目标备份</div>
                            {['products_count', 'transactions_count', 'audit_logs_count', 'users_count'].map(key => {
                              const labels = { products_count: '产品', transactions_count: '出入库记录', audit_logs_count: '审计日志', users_count: '用户' };
                              return [
                                <div key={`${key}-label`} className="text-slate-600">{labels[key]}</div>,
                                <div key={`${key}-curr`} className="text-slate-800 text-center font-medium">{(restorePlan.current_counts && restorePlan.current_counts[key]) ?? '—'}</div>,
                                <div key={`${key}-tgt`} className="text-blue-800 text-center font-medium">{(restorePlan.target_counts && restorePlan.target_counts[key]) ?? '—'}</div>
                              ];
                            })}
                          </div>
                        </div>

                        {/* 风险提示 */}
                        <div className="mb-3 pt-3 border-t border-amber-200">
                          <div className="text-xs font-medium text-amber-700 mb-1">⚠️ 风险提示</div>
                          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                            {restorePlan.risks && restorePlan.risks.map((risk, i) => (
                              <li key={i}>{risk}</li>
                            ))}
                          </ul>
                        </div>

                        {/* 确认短语 */}
                        <div className="mb-3 pt-3 border-t border-blue-200">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">恢复执行确认短语</div>
                          <div className="p-2 bg-white border border-blue-300 rounded text-xs font-mono text-slate-700">
                            {restorePlan.confirmation_phrase}
                          </div>
                        </div>

                        {/* 操作信息 */}
                        <div className="pt-3 border-t border-blue-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>操作人：{restorePlan.operator}</span>
                          <span>时间：{new Date(restorePlan.timestamp).toLocaleString('zh-CN')}</span>
                        </div>

                        {/* 提示 */}
                        <div className="mt-3 p-2.5 bg-white border border-blue-200 rounded-md text-xs text-slate-600">
                          当前版本只完成恢复前准备（创建安全备份 + 生成恢复计划），不执行真实恢复。恢复计划已记录审计日志。
                        </div>
                      </div>
                    )}

                    {/* 提示 */}
                    <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500">
                      当前版本仅支持恢复前预检和恢复准备，不执行真实恢复。如需从备份恢复数据库，请联系管理员按恢复流程操作。
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400 py-2">仅管理员可执行恢复预检</div>
                )}
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">系统日志</div>
                <p className="text-sm text-slate-600 mb-3">查看系统操作日志</p>
                <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium">
                  查看日志
                </button>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">数据源状态</div>
                <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-700">当前数据源模式:</span>
                    <span className={`text-sm font-medium px-2 py-1 rounded ${dataSourceMode === 'api' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {dataSourceMode === 'api' ? 'API 模式 (真实数据)' : dataSourceMode === 'mock' ? 'MOCK 模式 (演示数据)' : '未知'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    {dataSourceMode === 'api'
                      ? '系统当前使用真实后端数据，重置操作仅影响本地缓存。'
                      : dataSourceMode === 'mock'
                      ? '系统当前使用本地演示数据，重置操作将恢复为初始测试状态。'
                      : '数据源模式检测中...'}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="font-medium text-slate-800 mb-2">开发调试</div>
                <p className="text-sm text-slate-600 mb-3">
                  重置本地测试数据。此操作将清空当前浏览器中的本地演示数据，恢复为初始测试状态。
                </p>
                <button
                  onClick={handleOpenResetConfirm}
                  disabled={!canWrite}
                  title={!canWrite ? adminOnlyTitle : ''}
                  className={`px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-md hover:bg-rose-100 transition-colors font-medium ${
                    !canWrite ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  重置本地测试数据
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
          <div className="p-4 md:p-6">
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

        {/* Step 10-8A：管理员维护检查 */}
        <GoLiveChecklistPanel canWrite={canWrite} />

        {/* Step 10-8A：库存系统功能介绍与使用说明 */}
        <SystemOperationGuide />

        {/* 账号安全 / 修改密码 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">账号安全</h2>
            <p className="text-sm text-slate-500 mt-1">修改当前登录账号的密码</p>
          </div>
          <div className="p-4 md:p-6">
            <form onSubmit={handleChangePassword} className="max-w-lg">
              {/* 当前密码 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  当前密码
                </label>
                <input
                  type="password"
                  value={pwdForm.oldPassword}
                  onChange={(e) => handlePwdChange('oldPassword', e.target.value)}
                  placeholder="请输入当前密码"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
              {/* 新密码 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  新密码
                </label>
                <input
                  type="password"
                  value={pwdForm.newPassword}
                  onChange={(e) => handlePwdChange('newPassword', e.target.value)}
                  placeholder="新密码（不少于 6 位）"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
              {/* 确认新密码 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  确认新密码
                </label>
                <input
                  type="password"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => handlePwdChange('confirmPassword', e.target.value)}
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
              {/* 错误提示 */}
              {pwdError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md">
                  <span className="text-sm text-rose-700">{pwdError}</span>
                </div>
              )}
              {/* 成功提示 */}
              {pwdSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                  <span className="text-sm text-emerald-700">{pwdSuccess}</span>
                </div>
              )}
              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={isChangingPwd}
                className="px-6 py-2.5 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isChangingPwd ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    修改中...
                  </>
                ) : (
                  '修改密码'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 维护备份确认对话框 */}
      {showBackupConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                确认创建数据库备份
              </h2>
            </div>
            <div className="p-4 md:p-6">
              <div className="mb-6">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md mb-4">
                  <div className="flex items-start">
                    <div className="shrink-0 mr-3 mt-0.5">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-amber-600">!</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-amber-800 mb-1">操作确认</div>
                      <div className="text-sm text-amber-700">
                        将对当前 SQLite 数据库创建完整物理副本。备份文件将保存在服务器 backups 目录下，不会影响当前运行的系统。
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-700 mb-4">
                  <p className="font-medium text-slate-800 mb-2">操作说明：</p>
                  <ul className="space-y-2 pl-5">
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                      <span>仅创建备份文件，不会修改任何业务数据</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                      <span>备份文件格式：inventory_backup_YYYYMMDD_HHMMSS.sqlite</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2"></span>
                      <span>此操作不可逆，备份文件需手动管理</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* 操作结果提示 */}
              {maintBackupResult && showBackupConfirm && (
                <div className={`mb-4 p-3.5 rounded-md border ${maintBackupResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="text-sm font-medium mb-1">
                    {maintBackupResult.success ? '✅ 备份创建成功' : '❌ 备份创建失败'}
                  </div>
                  <div className={`text-sm ${maintBackupResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {maintBackupResult.message}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseMaintenanceBackupConfirm}
                  disabled={isMaintenanceBackup}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMaintenanceBackup}
                  disabled={isMaintenanceBackup || maintBackupResult?.success}
                  className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isMaintenanceBackup ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      备份中...
                    </>
                  ) : (
                    '确认备份'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 重置确认对话框 */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                确认重置本地测试数据
              </h2>
            </div>
            <div className="p-4 md:p-6">
              {/* 警告信息 */}
              <div className="mb-6">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-md mb-4">
                  <div className="flex items-start">
                    <div className="shrink-0 mr-3 mt-0.5">
                      <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-rose-600">!</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-rose-800 mb-1">
                        {dataSourceMode === 'api'
                          ? '当前为 API 模式，重置操作仅影响本地缓存'
                          : '此操作将清空当前浏览器中的本地演示数据'}
                      </div>
                      <div className="text-sm text-rose-700">
                        {dataSourceMode === 'api'
                          ? '系统数据来自真实后端，重置不会影响真实业务数据'
                          : '系统会恢复为初始测试状态，请谨慎操作'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-700 mb-4">
                  <p className="font-medium text-slate-800 mb-2">操作影响：</p>
                  <ul className="space-y-2 pl-5">
                    {dataSourceMode === 'api' ? (
                      <>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                          <span>仅清空浏览器本地缓存数据，不影响真实后端数据</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                          <span>页面刷新后将重新从 API 加载真实数据</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 mr-2"></span>
                          <span>此操作不会影响真实业务系统的产品库存和交易记录</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2"></span>
                          <span>重置成功后页面将自动刷新，重新加载 API 数据</span>
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                          <span>清空所有产品、交易记录、审计日志的本地存储</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 mr-2"></span>
                          <span>恢复为初始 mock 测试数据</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 mr-2"></span>
                          <span>此操作仅影响当前浏览器本地数据，不影响真实业务系统</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2"></span>
                          <span>重置成功后页面将自动刷新</span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              {/* 操作结果提示 */}
              {resetResult && (
                <div className={`mb-4 p-3.5 rounded-md border ${resetResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="text-sm font-medium mb-1">
                    {resetResult.success ? '✅ 重置操作已执行' : '❌ 重置操作失败'}
                  </div>
                  <div className={`text-sm font-medium ${resetResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {resetResult.message}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseResetConfirm}
                  disabled={isResetting}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={isResetting}
                  className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      重置中...
                    </>
                  ) : (
                    '确认重置'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="mt-8 p-4 md:p-6 bg-white border border-slate-200 rounded-lg">
        <div className="flex justify-end gap-4">
          <button
            disabled={!canWrite}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-6 py-2.5 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium ${
              !canWrite ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            恢复默认
          </button>
          <button
            disabled={!canWrite}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-6 py-2.5 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium ${
              !canWrite ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
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