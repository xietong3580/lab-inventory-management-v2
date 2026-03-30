import { useState, useEffect } from 'react';
import { getAllProducts, filterProducts, addProduct, updateProduct, deleteProduct } from '../services/productService';

// 状态标签组件
function StatusBadge({ status }) {
  const config = {
    正常: { text: '正常', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    低库存: { text: '低库存', bg: 'bg-amber-50', textColor: 'text-amber-700' },
  };
  const { text, bg, textColor } = config[status] || config.正常;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

function Products() {
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // 分类选项
  const categories = ['all', '耗材', '试剂', '设备'];

  // 初始化产品数据
  useEffect(() => {
    const products = getAllProducts();
    setAllProducts(products);
    setFilteredProducts(products);
  }, []);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedProducts = filteredProducts.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const handleSearch = (e) => {
    e.preventDefault();
    // 执行搜索和筛选
    const filtered = filterProducts(allProducts, searchTerm, selectedCategory);
    setFilteredProducts(filtered);
    setCurrentPage(1); // 重置到第一页
  };

  const handleReset = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setFilteredProducts(allProducts);
    setCurrentPage(1);
  };

  // 操作按钮事件处理（当前阶段为占位实现）
  const handleAddProduct = () => {
    console.log('[Products] 点击新增产品按钮');
    // 后续可打开模态框表单
    addProduct({
      name: '新产品',
      sku: `PRD-${Date.now().toString().slice(-6)}`,
      category: '耗材',
      currentStock: 0,
      minStock: 10,
      unit: '个',
      location: '待分配',
      status: '正常',
      lastUpdated: new Date().toISOString().split('T')[0]
    });
    alert('新增产品功能开发中，请查看控制台日志');
  };

  const handleEditProduct = (productId) => {
    console.log('[Products] 点击编辑产品:', productId);
    // 后续可打开编辑模态框
    updateProduct(productId, { name: '更新后的产品名称' });
    alert(`编辑产品 ${productId} 功能开发中，请查看控制台日志`);
  };

  const handleDeleteProduct = (productId) => {
    if (confirm('确定要删除这个产品吗？此操作不可撤销。')) {
      console.log('[Products] 点击删除产品:', productId);
      // 后续可实现实际删除逻辑
      deleteProduct(productId);
      alert(`删除产品 ${productId} 功能开发中，请查看控制台日志`);
    }
  };

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">产品管理</h1>
        <p className="text-slate-600 mt-1">
          管理库存系统中的所有产品，包括产品信息、库存状态和存储位置。
        </p>
      </div>

      {/* 操作栏：新增按钮与筛选区域 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* 左侧：新增产品按钮 */}
          <button
            onClick={handleAddProduct}
            className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
          >
            + 新增产品
          </button>

          {/* 右侧：搜索与筛选 */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 搜索框 */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜索产品名称或 SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>

            {/* 分类筛选 */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
            >
              <option value="all">全部分类</option>
              <option value="耗材">耗材</option>
              <option value="试剂">试剂</option>
              <option value="设备">设备</option>
            </select>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
              >
                搜索
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                重置
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 产品表格 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 表格头部 */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  产品名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  分类
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  最低库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  存储位置
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{product.sku}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-800">{product.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{product.category}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">
                      {product.currentStock} {product.unit}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">
                      {product.minStock} {product.unit}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={product.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{product.location}</div>
                    <div className="text-xs text-slate-500 mt-1">更新: {product.lastUpdated}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditProduct(product.id)}
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控制 */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            显示第 {startIndex + 1} - {Math.min(endIndex, filteredProducts.length)} 条，共 {filteredProducts.length} 条记录
          </div>
          <div className="flex items-center gap-2">
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
                    className={`w-8 h-8 rounded text-sm ${
                      currentPage === pageNum
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
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
                    className={`w-8 h-8 rounded text-sm ${
                      currentPage === totalPages
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
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
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：点击“编辑”可修改产品信息，点击“删除”将移除该产品记录。低库存状态的产品会以橙色标识。
        </div>
      </div>
    </div>
  );
}

export default Products;