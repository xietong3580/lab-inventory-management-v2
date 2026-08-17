import { useEffect, useRef, useState } from 'react';
import { fetchProductImageBlob } from '../../services/productImageService';

/**
 * 产品大图预览弹窗
 * - 居中显示，深色半透明遮罩
 * - object-contain，限制在视口内，不产生横向滚动
 * - 显示产品名称与货号
 * - 支持关闭按钮、点击遮罩关闭、Escape 键关闭；点击图片本身不关闭
 */
function ProductImagePreview({ product, onClose }) {
  const productId = product?.id;
  const version = product?.imageUpdatedAt || '';

  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef(null);

  // product 变化时在渲染期间重置状态（React 推荐模式，避免 effect 内同步 setState）
  const key = product ? `${productId}:${version}` : '';
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setUrl(null);
    setError(false);
  }

  useEffect(() => {
    if (!productId) return undefined;

    let cancelled = false;

    fetchProductImageBlob(productId, version)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setError(true);
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [productId, version]);

  // Escape 关闭 + 卸载释放
  useEffect(() => {
    if (!product) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [product, onClose]);

  if (!product) return null;

  const loading = !url && !error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="产品大图预览"
    >
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：产品信息 + 关闭按钮 */}
        <div className="flex items-start justify-between gap-4 px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-slate-800 truncate">
              {product.name || '产品图片'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
              {product.sku || product.id || ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="关闭"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 图片区域 */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-50 p-4 overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              加载中...
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center text-slate-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm">图片加载失败</span>
            </div>
          )}
          {!loading && !error && url && (
            <img
              src={url}
              alt={product.name || ''}
              className="max-w-full max-h-[70vh] object-contain"
              onError={() => {
                // 加载失败：释放 objectURL，清空 URL，显示占位，不产生无限重试
                if (objectUrlRef.current) {
                  URL.revokeObjectURL(objectUrlRef.current);
                  objectUrlRef.current = null;
                }
                setUrl(null);
                setError(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductImagePreview;
