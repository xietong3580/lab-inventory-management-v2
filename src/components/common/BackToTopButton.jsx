import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);
  const portalContainerRef = useRef(null);

  // 创建 Portal 容器并附加到 body，确保按钮位于最高层
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'back-to-top-button-portal';
    container.style.position = 'fixed';
    container.style.zIndex = '9999';
    container.style.bottom = '0';
    container.style.right = '0';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
    portalContainerRef.current = container;

    return () => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    };
  }, []);

  // 监听滚动事件，控制按钮显示/隐藏
  useEffect(() => {
    const handleScroll = () => {
      // 当页面向下滚动超过 300px 时显示按钮
      const shouldShow = window.scrollY > 300;
      if (shouldShow !== isVisible) {
        setIsVisible(shouldShow);
      }
    };

    window.addEventListener('scroll', handleScroll);
    // 初始化检查
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isVisible]);

  // 平滑滚动到顶部
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // 按钮样式：简洁、专业、符合企业后台风格，进一步弱化视觉存在感
  const buttonElement = (
    <button
      onClick={scrollToTop}
      className={`
        fixed z-50
        bottom-3 right-3 sm:bottom-4 sm:right-4 md:bottom-5 md:right-5
        w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10
        bg-slate-500/80 hover:bg-slate-600/80
        text-white
        rounded-full
        shadow-xs hover:shadow-sm
        flex items-center justify-center
        transition-all duration-300 ease-in-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
        focus:outline-none focus:ring-1 focus:ring-slate-400 focus:ring-offset-1
        backdrop-blur-sm
        pointer-events-auto
      `}
      aria-label="返回顶部"
      title="返回顶部"
    >
      <svg
        className="w-4 h-4 sm:w-4 sm:h-4 md:w-5 md:h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
    </button>
  );

  // 如果 Portal 容器已创建，通过 Portal 渲染；否则返回 null（避免 SSR 问题）
  if (!portalContainerRef.current) {
    return null;
  }

  return createPortal(buttonElement, portalContainerRef.current);
}

export default BackToTopButton;