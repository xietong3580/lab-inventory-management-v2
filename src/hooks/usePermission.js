import { useAuth } from '../contexts/AuthContext';

/**
 * 统一权限工具 hook
 *
 * 用法：
 *   const { isAdmin, isViewer, canWrite, adminOnlyTitle } = usePermission();
 *
 * 然后在按钮上：
 *   <button disabled={!canWrite} title={!canWrite ? adminOnlyTitle : ''}>删除</button>
 */
export function usePermission() {
  const { isAdmin } = useAuth();

  return {
    /** 当前用户是否为 admin */
    isAdmin,
    /** 当前用户是否为 viewer（只读） */
    isViewer: !isAdmin,
    /** 是否有写权限（admin 可写，viewer 只读） */
    canWrite: isAdmin,
    /** 统一的无权限提示文案 */
    adminOnlyTitle: '仅管理员可操作',
  };
}

export default usePermission;
