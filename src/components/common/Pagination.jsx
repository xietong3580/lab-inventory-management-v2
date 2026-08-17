import { getPaginationItems } from '../../utils/paginationHelpers';

// 通用分页组件
// 接收 currentPage / totalPages / onPageChange，负责渲染上一页、页码、下一页。
// 页码序列由 paginationHelpers 计算，当前页始终可见并高亮。
function Pagination({ currentPage, totalPages, onPageChange }) {
  const items = getPaginationItems(currentPage, totalPages);

  return (
    <div className="w-full md:w-auto flex justify-center flex-wrap items-center gap-2 whitespace-nowrap">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
        {items.map((item) => {
          if (item.type === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${item.side}`}
                className="text-slate-400"
                aria-hidden="true"
              >
                ...
              </span>
            );
          }
          const isCurrent = item.page === currentPage;
          return (
            <button
              key={item.page}
              onClick={() => onPageChange(item.page)}
              aria-label={`第 ${item.page} 页`}
              aria-current={isCurrent ? 'page' : undefined}
              className={`px-3 py-1.5 rounded border text-sm ${
                isCurrent
                  ? 'bg-slate-700 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.page}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
  );
}

export default Pagination;
