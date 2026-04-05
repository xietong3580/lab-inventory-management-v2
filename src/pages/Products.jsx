import { useState, useEffect } from 'react';
import { getProductsWithCalculatedStatus, filterProducts, calculateProductStatus, updateProduct, addProduct, deleteProduct, getProductInventoryLedger } from '../services/productService';
import { getLedgerTypeConfig, formatLedgerTime } from '../utils/inventoryHistoryHelpers';

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

  // 模态框和表单相关状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null 表示新增，非null表示编辑

  // 台账弹窗相关状态
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [selectedProductForLedger, setSelectedProductForLedger] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '耗材',
    currentStock: 0,
    minStock: 0,
    unit: '个',
    location: ''
  });

  // 辅助函数：获取当前日期字符串
  const getToday = () => new Date().toISOString().split('T')[0];

  // 初始化产品数据
  useEffect(() => {
    const products = getProductsWithCalculatedStatus();
    setAllProducts(products);
    setFilteredProducts(products);
  }, []);

  // 当产品数据、搜索词或分类变化时，重新筛选
  useEffect(() => {
    const filtered = filterProducts(allProducts, searchTerm, selectedCategory);
    setFilteredProducts(filtered);
    // 如果筛选后当前页超出范围，重置到第一页
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [allProducts, searchTerm, selectedCategory]);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedProducts = filteredProducts.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const handleSearch = (e) => {
    e.preventDefault();
    // 搜索按钮主要用于重置到第一页，筛选逻辑由useEffect自动处理
    setCurrentPage(1);
  };

  const handleReset = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setCurrentPage(1);
  };

  // 打开模态框（新增或编辑）
  const handleOpenModal = (product = null) => {
    setEditingProduct(product);
    if (product) {
      // 编辑模式：回填现有数据
      setFormData({
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentStock: product.currentStock,
        minStock: product.minStock,
        unit: product.unit,
        location: product.location
      });
    } else {
      // 新增模式：重置表单
      setFormData({
        name: '',
        sku: '',
        category: '耗材',
        currentStock: 0,
        minStock: 0,
        unit: '个',
        location: ''
      });
    }
    setIsModalOpen(true);
  };

  // 关闭模态框
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  // 表单提交
  const handleFormSubmit = (e) => {
    e.preventDefault();

    // 轻量必填校验
    if (!formData.name.trim()) {
      alert('产品名称不能为空');
      return;
    }
    if (!formData.sku.trim()) {
      alert('SKU不能为空');
      return;
    }

    if (editingProduct) {
      // 更新现有产品
      const updates = {
        ...formData,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
        lastUpdated: getToday()
      };
      const updatedProduct = updateProduct(editingProduct.id, updates);
      if (updatedProduct) {
        // 根据库存数量自动计算状态
        updatedProduct.status = calculateProductStatus(updatedProduct);
        setAllProducts(allProducts.map(p =>
          p.id === editingProduct.id ? updatedProduct : p
        ));
      }
    } else {
      // 添加新产品
      const newProductData = {
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        category: formData.category,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
        unit: formData.unit,
        location: formData.location.trim(),
        lastUpdated: getToday()
      };
      const newProduct = addProduct(newProductData);
      // 根据库存数量自动计算状态
      newProduct.status = calculateProductStatus(newProduct);
      setAllProducts([...allProducts, newProduct]);
    }

    handleCloseModal();
  };

  // 表单字段变化处理
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 操作按钮事件处理
  const handleAddProduct = () => {
    handleOpenModal(); // 新增模式
  };

  const handleEditProduct = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (product) {
      handleOpenModal(product); // 编辑模式
    }
  };

  const handleDeleteProduct = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (product && confirm(`确定要删除产品 "${product.name}"(${product.sku}) 吗？此操作不可撤销。`)) {
      const success = deleteProduct(productId);
      if (success) {
        setAllProducts(allProducts.filter(p => p.id !== productId));
      }
    }
  };

  // 打开台账弹窗
  const handleOpenLedgerModal = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    setSelectedProductForLedger(product);
    setIsLoadingLedger(true);
    setLedgerModalOpen(true);

    try {
      const ledger = getProductInventoryLedger(productId);
      setLedgerData(ledger);
    } catch (error) {
      console.error('获取台账数据失败:', error);
      setLedgerData([]);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  // 关闭台账弹窗
  const handleCloseLedgerModal = () => {
    setLedgerModalOpen(false);
    setSelectedProductForLedger(null);
    setLedgerData([]);
    setIsLoadingLedger(false);
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
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium w-full sm:w-auto"
              >
                搜索
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors w-full sm:w-auto"
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
          <table className="min-w-[900px] md:min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  SKU
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  产品名称
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  分类
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  库存
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  最低库存
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  状态
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  存储位置
                </th>
                <th className="px-4 py-2 md:px-6 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{product.sku}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4">
                    <div className="text-sm font-medium text-slate-800">{product.name}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{product.category}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">
                      {product.currentStock} {product.unit}
                    </div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">
                      {product.minStock} {product.unit}
                    </div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <StatusBadge status={product.status} />
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4">
                    <div className="text-sm text-slate-700">{product.location}</div>
                    <div className="text-xs text-slate-500 mt-1">更新: {product.lastUpdated}</div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditProduct(product.id)}
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleOpenLedgerModal(product.id)}
                        className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                      >
                        台账
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
        <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
          <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
            显示第 {startIndex + 1} - {Math.min(endIndex, filteredProducts.length)} 条，共 {filteredProducts.length} 条记录
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
          提示：点击"编辑"可修改产品信息，点击"删除"将移除该产品记录。低库存状态的产品会以橙色标识。
        </div>
      </div>

      {/* 产品表单模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                {editingProduct ? '编辑产品' : '新增产品'}
              </h2>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="p-6 space-y-4">
                {/* 产品名称 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    产品名称 *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    placeholder="请输入产品名称"
                  />
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    SKU 编码 *
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    placeholder="如：PRD-2026001"
                  />
                </div>

                {/* 分类和单位 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      分类
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                    >
                      <option value="耗材">耗材</option>
                      <option value="试剂">试剂</option>
                      <option value="设备">设备</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      单位
                    </label>
                    <select
                      name="unit"
                      value={formData.unit}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                    >
                      <option value="个">个</option>
                      <option value="盒">盒</option>
                      <option value="瓶">瓶</option>
                      <option value="包">包</option>
                      <option value="套">套</option>
                    </select>
                  </div>
                </div>

                {/* 库存数量 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      当前库存
                    </label>
                    <input
                      type="number"
                      name="currentStock"
                      value={formData.currentStock}
                      onChange={handleFormChange}
                      min="0"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      最低库存
                    </label>
                    <input
                      type="number"
                      name="minStock"
                      value={formData.minStock}
                      onChange={handleFormChange}
                      min="0"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 存储位置 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    存储位置
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    placeholder="如：A区-1排-2层"
                  />
                </div>

              </div>

              {/* 模态框底部按钮 */}
              <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
                >
                  {editingProduct ? '更新产品' : '添加产品'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 库存台账弹窗 */}
      {ledgerModalOpen && selectedProductForLedger && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  库存台账 - {selectedProductForLedger.name}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  SKU: {selectedProductForLedger.sku} | 当前库存: {selectedProductForLedger.currentStock} {selectedProductForLedger.unit} | 最低库存: {selectedProductForLedger.minStock} {selectedProductForLedger.unit}
                </p>
              </div>
              <button
                onClick={handleCloseLedgerModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="flex-grow overflow-auto p-4 md:p-6">
              {isLoadingLedger ? (
                <div className="flex justify-center items-center py-12">
                  <div className="text-slate-500">加载台账数据中...</div>
                </div>
              ) : ledgerData.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-slate-400 mb-2">暂无库存变动记录</div>
                  <div className="text-sm text-slate-500">该产品尚未有任何出入库或编辑操作</div>
                </div>
              ) : (
                <>
                  {/* 桌面端表格视图 */}
                  <div className="hidden md:block">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              时间
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              类型
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              变动数量
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              变更前库存
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              变更后库存
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              操作人
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              摘要说明
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {ledgerData.map((entry) => {
                            const typeConfig = getLedgerTypeConfig(entry.type);
                            return (
                              <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-sm text-slate-700">{formatLedgerTime(entry.timestamp)}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 rounded text-xs font-medium border ${typeConfig.color}`}>
                                    {typeConfig.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className={`text-sm font-medium ${entry.stockChange > 0 ? 'text-emerald-700' : entry.stockChange < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                                    {entry.stockChange > 0 ? '+' : ''}{entry.stockChange} {entry.unit}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-sm text-slate-700">
                                    {entry.oldStock !== undefined ? `${entry.oldStock} ${entry.unit}` : '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-sm font-medium text-slate-800">
                                    {entry.newStock !== undefined ? `${entry.newStock} ${entry.unit}` : '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-sm text-slate-700">{entry.operator || '系统'}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-sm text-slate-700 max-w-xs">{entry.notes || '-'}</div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 移动端卡片视图 */}
                  <div className="md:hidden space-y-3">
                    {ledgerData.map((entry) => {
                      const typeConfig = getLedgerTypeConfig(entry.type);
                      return (
                        <div key={entry.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                          <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                            <div className="text-sm text-slate-500">{formatLedgerTime(entry.timestamp)}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <div className="text-xs text-slate-500 mb-1">变动数量</div>
                              <div className={`text-sm font-medium ${entry.stockChange > 0 ? 'text-emerald-700' : entry.stockChange < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                                {entry.stockChange > 0 ? '+' : ''}{entry.stockChange} {entry.unit}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">操作人</div>
                              <div className="text-sm text-slate-700">{entry.operator || '系统'}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <div className="text-xs text-slate-500 mb-1">变更前库存</div>
                              <div className="text-sm text-slate-700">
                                {entry.oldStock !== undefined ? `${entry.oldStock} ${entry.unit}` : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">变更后库存</div>
                              <div className="text-sm font-medium text-slate-800">
                                {entry.newStock !== undefined ? `${entry.newStock} ${entry.unit}` : '—'}
                              </div>
                            </div>
                          </div>

                          {entry.notes && (
                            <div>
                              <div className="text-xs text-slate-500 mb-1">摘要说明</div>
                              <div className="text-sm text-slate-700">{entry.notes}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 记录统计 */}
                  <div className="mt-6 pt-4 border-t border-slate-200">
                    <div className="text-sm text-slate-600">
                      共 {ledgerData.length} 条记录，时间范围: {formatLedgerTime(ledgerData[ledgerData.length - 1]?.timestamp)} 至 {formatLedgerTime(ledgerData[0]?.timestamp)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={handleCloseLedgerModal}
                className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;