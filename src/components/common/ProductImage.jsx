import { useEffect, useRef, useState } from 'react';
import { fetchProductImageBlob } from '../../services/productImageService';

// 缩略图占位（无图 / 加载失败），统一视觉，不误导为已上传图片
function ImagePlaceholder({ className = '', label = '暂无图片' }) {
  return (
    <div
      className={`flex items-center justify-center bg-slate-50 border border-slate-200 rounded-md ${className}`}
      title={label}
      aria-label={label}
    >
      <svg
        className="w-6 h-6 text-slate-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

/**
 * 产品缩略图组件
 * - 有图片：通过带鉴权请求获取 Blob，用 URL.createObjectURL 显示，可点击查看大图
 * - 无图片 / 加载失败：显示统一占位，不发起无意义请求，不显示破损图片
 * - 组件卸载或图片变化时调用 URL.revokeObjectURL 释放内存
 */
function ProductImage({ product, onClick, className = '' }) {
  const hasImage = !!product?.hasImage;
  const productId = product?.id;
  const version = product?.imageUpdatedAt || '';

  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef(null);

  // product / version 变化时在渲染期间重置状态（React 推荐模式，避免 effect 内同步 setState）
  const key = hasImage ? `${productId}:${version}` : '';
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setUrl(null);
    setError(false);
  }

  useEffect(() => {
    if (!hasImage || !productId) return undefined;

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
  }, [productId, hasImage, version]);

  // 卸载时释放 objectURL
  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    },
    []
  );

  if (!hasImage) {
    return <ImagePlaceholder className={className} />;
  }

  if (error) {
    return <ImagePlaceholder className={className} label="图片加载失败" />;
  }

  if (url) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`block overflow-hidden bg-slate-50 border border-slate-200 rounded-md cursor-pointer hover:ring-2 hover:ring-slate-300 transition ${className}`}
        aria-label="查看产品大图"
        title="查看大图"
      >
        <img
          src={url}
          alt={product?.name || ''}
          className="w-full h-full object-contain"
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
      </button>
    );
  }

  // 加载中
  return (
    <div className={`flex items-center justify-center bg-slate-50 border border-slate-200 rounded-md ${className}`}>
      <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
    </div>
  );
}

export default ProductImage;
