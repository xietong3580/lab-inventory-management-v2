import { useState, useEffect, useRef } from 'react';
import { productService as dataProductService } from '../services/dataService';
import { getProductsWithCalculatedStatus, calculateProductStatus, updateProduct, addProduct, deleteProduct } from '../services/productService';
import { getLedgerTypeConfig, formatLedgerTime } from '../utils/inventoryHistoryHelpers';
import { filterProducts, hasActiveFilters, calculateVerificationStatus } from '../utils/productFilterHelpers';
import { exportProductsToCSV } from '../utils/exportHelpers';
import { runPreflightCheck, createMaintenanceBackup } from '../services/backupService';
import { usePermission } from '../hooks/usePermission';
import {
  INVENTORY_CATEGORIES,
  getLocationOptionsByCategory,
  getDefaultLocationByCategory,
  buildCategoryOptions,
} from '../constants/inventoryLocations';

// 产品状态标签组件
function StatusBadge({ status }) {
  const config = {
    正常: { text: '正常', bg: 'bg-slate-50', textColor: 'text-slate-500' },
    低库存: { text: '低库存', bg: 'bg-amber-50', textColor: 'text-amber-700' },
  };
  const { text, bg, textColor } = config[status] || config.正常;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 核对状态提示（用于表单内联展示）
function getVerificationHints(formData) {
  const missing = [];
  const suggestions = [];
  const priceHints = [];

  if (!formData.name || !String(formData.name).trim()) missing.push('产品名称');
  if (!formData.sku || !String(formData.sku).trim()) missing.push('SKU 编码');
  if (Number(formData.currentStock) < 0) missing.push('当前库存为负数');
  const min = formData.minStock;
  if (min === '' || min === null || min === undefined || isNaN(Number(min)) || Number(min) < 0) missing.push('最低库存设置');

  if (!formData.category || !String(formData.category).trim()) suggestions.push('库存分类');
  if (!formData.location || !String(formData.location).trim()) suggestions.push('存储位置');
  if (!formData.unit || !String(formData.unit).trim()) suggestions.push('单位');

  // 价格字段仅温和提示，不影响核对状态
  if (formData.purchasePrice === '' || formData.purchasePrice === null || formData.purchasePrice === undefined) priceHints.push('采购价');
  if (formData.salePrice === '' || formData.salePrice === null || formData.salePrice === undefined) priceHints.push('售价');

  const priceNote = priceHints.length > 0
    ? `采购价、售价可在后续核对后补充；如暂时未知，可以留空，不建议用 0 代表未知。`
    : '';

  if (missing.length > 0) {
    return {
      status: '需核对',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      textColor: 'text-rose-800',
      hintColor: 'text-rose-700',
      message: `该产品缺少 ${missing.join('、')}，请优先核对后再正式使用。`,
      priceNote
    };
  }
  if (suggestions.length > 0) {
    return {
      status: '建议补充',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      textColor: 'text-amber-800',
      hintColor: 'text-amber-700',
      message: `建议补充${suggestions.join('、')}，便于后续核对。`,
      priceNote
    };
  }
  return {
    status: '信息完整',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    textColor: 'text-emerald-800',
    hintColor: 'text-emerald-700',
    message: '该产品资料基本完整，可用于正式库存管理。',
    priceNote
  };
}

// 核对状态标签组件
function VerificationBadge({ status }) {
  const config = {
    '信息完整': { text: '信息完整', bg: 'bg-slate-50', textColor: 'text-slate-500' },
    '建议补充': { text: '建议补充', bg: 'bg-amber-50', textColor: 'text-amber-600' },
    '需核对': { text: '需核对', bg: 'bg-rose-50', textColor: 'text-rose-600' },
  };
  const { text, bg, textColor } = config[status] || config['信息完整'];

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 台账状态标签组件
function LedgerStatusBadge({ status }) {
  const config = {
    completed: { text: '已完成', bg: 'bg-emerald-50', textColor: 'text-emerald-700', border: 'border-emerald-200' },
    reversed: { text: '已撤销', bg: 'bg-slate-50', textColor: 'text-slate-600', border: 'border-slate-300' },
  };
  const { text, bg, textColor, border } = config[status] || config.completed;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${bg} ${textColor} ${border}`}>
      {text}
    </span>
  );
}

function Products() {
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { canWrite, adminOnlyTitle } = usePermission();

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [minStock, setMinStock] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const searchInputRef = useRef(null);

  // 是否有活跃筛选条件
  const activeFilters = hasActiveFilters({
    keyword: searchTerm,
    category: selectedCategory,
    status: selectedStatus,
    minStock,
    maxStock,
    location: selectedLocation,
    brand: selectedBrand,
    verificationFilter
  });

  // 模态框和表单相关状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null 表示新增，非null表示编辑

  // 台账弹窗相关状态
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [selectedProductForLedger, setSelectedProductForLedger] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // 操作反馈状态
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null); // 正在删除的产品 ID
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(null); // Step 10-20C：删除确认弹窗
  const [deleteError, setDeleteError] = useState(''); // Step 10-20C：删除错误提示
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success'|'error', text: '...' }

  // 导出前安全检查相关状态
  const [isPreflightChecking, setIsPreflightChecking] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [preflightError, setPreflightError] = useState('');
  const [showPreflightModal, setShowPreflightModal] = useState(false);
  const [isBackupBeforeExport, setIsBackupBeforeExport] = useState(false);
  const [backupExportError, setBackupExportError] = useState('');

  // Step 10-27C: 七字段复合键完全重复检查（品牌+货号+名称+规格+单位+分类+位置）
  // 同货号不同规格/库位/品牌不再视为重复。
  const [skuError, setSkuError] = useState(null);
  const [nameWarning, setNameWarning] = useState(null);
  const [nameSpecWarning, setNameSpecWarning] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '2楼库存',
    currentStock: 0,
    minStock: 0,
    unit: '个',
    location: '',
    brand: '',
    specification: '',
    supplier: '',
    notes: '',
    purchasePrice: '',
    salePrice: ''
  });

  // 辅助函数：获取当前日期字符串
  const getToday = () => new Date().toISOString().split('T')[0];

  // 初始化产品数据
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const products = await dataProductService.getProductsWithCalculatedStatus();
        setAllProducts(products);
        setFilteredProducts(products);
      } catch (error) {
        console.error('加载产品数据失败:', error);
        // 降级使用原 mock 数据
        const fallbackProducts = getProductsWithCalculatedStatus();
        setAllProducts(fallbackProducts);
        setFilteredProducts(fallbackProducts);
        // 记录错误但继续使用降级数据
        setError(`数据加载失败，已使用本地数据: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, []);

  // 页面加载完成后自动聚焦搜索框
  useEffect(() => {
    if (!isModalOpen && !ledgerModalOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isModalOpen, ledgerModalOpen]);

  // 当产品数据、搜索词或分类变化时，重新筛选
  useEffect(() => {
    const filtered = filterProducts(
      allProducts,
      searchTerm,
      selectedCategory,
      selectedStatus,
      minStock,
      maxStock,
      selectedLocation,
      selectedBrand,
      verificationFilter
    );
    setFilteredProducts(filtered);
    // 如果筛选后当前页超出范围，重置到第一页
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [allProducts, searchTerm, selectedCategory, selectedStatus, minStock, maxStock, selectedLocation, selectedBrand, verificationFilter, currentPage, itemsPerPage]);

  // 当筛选条件变化时，重置到第一页（提供更及时的响应）
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedStatus, minStock, maxStock, selectedLocation, selectedBrand, verificationFilter]);

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
    setSelectedLocation('all');
    setSelectedBrand('all');
    setSelectedStatus('all');
    setMinStock('');
    setMaxStock('');
    setVerificationFilter('all');
    setCurrentPage(1);
    // 重置后自动聚焦搜索框，方便继续查下一个产品
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  const handleExport = async () => {
    if (filteredProducts.length === 0) {
      alert('没有可导出的数据，请先调整筛选条件或等待数据加载。');
      return;
    }
    // 导出前先运行安全检查
    setIsPreflightChecking(true);
    setPreflightResult(null);
    setPreflightError('');
    setBackupExportError('');
    try {
      const result = await runPreflightCheck();
      setPreflightResult(result);
    } catch (err) {
      setPreflightError(err.message || '安全检查请求失败');
    } finally {
      setIsPreflightChecking(false);
      setShowPreflightModal(true);
    }
  };

  // 确认导出（跳过安全检查或检查通过后）
  const handleConfirmExport = () => {
    setShowPreflightModal(false);
    exportProductsToCSV(filteredProducts, 'products-export');
  };

  // 创建备份后再导出（仅 admin 可用）
  const handleBackupThenExport = async () => {
    setIsBackupBeforeExport(true);
    setBackupExportError('');
    try {
      const result = await createMaintenanceBackup();
      if (!result || !result.success) {
        // 接口返回了非成功的响应
        setBackupExportError(
          result?.message || '数据库备份失败，接口返回异常状态，已取消导出。请先在系统设置中确认备份功能正常。'
        );
        return;
      }
      // 备份成功 → 继续导出
      setShowPreflightModal(false);
      exportProductsToCSV(filteredProducts, 'products-export');
    } catch (err) {
      setBackupExportError(
        err.message || '数据库备份失败，已取消导出。请先在系统设置中确认备份功能正常。'
      );
    } finally {
      setIsBackupBeforeExport(false);
    }
  };

  // 打开模态框（新增或编辑）
  const handleOpenModal = (product = null) => {
    if (!canWrite) return; // viewer 不可新增/编辑
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
        location: product.location || '',
        brand: product.brand || '',
        specification: product.specification || '',
        supplier: product.supplier || '',
        notes: product.notes || '',
        purchasePrice: product.purchasePrice != null ? product.purchasePrice : '',
        salePrice: product.salePrice != null ? product.salePrice : ''
      });
    } else {
      // 新增模式：重置表单
      setFormData({
        name: '',
        sku: '',
        category: '2楼库存',
        currentStock: 0,
        minStock: 0,
        unit: '个',
        location: '',
        brand: '',
        specification: '',
        supplier: '',
        notes: '',
        purchasePrice: '',
        salePrice: ''
      });
    }
    setIsModalOpen(true);
    // Step 10-6D：清空验证状态
    setSkuError(null);
    setNameWarning(null);
    setNameSpecWarning(null);
    setSaveError(null);
  };

  // 关闭模态框
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  // 表单提交（keepModalOpen 用于"保存并继续新增"）
  const handleFormSubmit = async (e, keepModalOpen = false) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!canWrite || isSaving) return; // viewer 不可提交，防重复提交

    // 轻量必填校验
    if (!formData.name.trim()) {
      setSaveError('产品名称不能为空，请填写后保存');
      return;
    }
    if (!formData.sku.trim()) {
      setSaveError('SKU 不能为空，请填写后保存');
      return;
    }

    // Step 10-27C: 七字段复合键完全重复前端预检查（提交前再次确认）
    if (skuError) {
      setSaveError(skuError);
      return;
    }

    // Step 10-6C：价格字段非负数校验
    if (formData.purchasePrice !== '' && Number(formData.purchasePrice) < 0) {
      setSaveError('采购价不能为负数');
      return;
    }
    if (formData.salePrice !== '' && Number(formData.salePrice) < 0) {
      setSaveError('售价不能为负数');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (editingProduct) {
        // 更新现有产品
        const updates = {
          ...formData,
          currentStock: Number(formData.currentStock) || 0,
          minStock: Number(formData.minStock) || 0,
          location: formData.location.trim(),
          brand: formData.brand.trim(),
          specification: formData.specification.trim(),
          supplier: formData.supplier.trim(),
          notes: formData.notes.trim(),
          purchasePrice: formData.purchasePrice !== '' ? Number(formData.purchasePrice) : null,
          salePrice: formData.salePrice !== '' ? Number(formData.salePrice) : null,
          lastUpdated: getToday()
        };
        const updatedProduct = await dataProductService.updateProduct(editingProduct.id, updates);
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
          brand: formData.brand.trim(),
          specification: formData.specification.trim(),
          supplier: formData.supplier.trim(),
          notes: formData.notes.trim(),
          purchasePrice: formData.purchasePrice !== '' ? Number(formData.purchasePrice) : null,
          salePrice: formData.salePrice !== '' ? Number(formData.salePrice) : null,
          lastUpdated: getToday()
        };
        const newProduct = await dataProductService.addProduct(newProductData);
        // 根据库存数量自动计算状态
        newProduct.status = calculateProductStatus(newProduct);
        setAllProducts([...allProducts, newProduct]);
      }

      // 保存成功
      setIsSaving(false);

      if (keepModalOpen && !editingProduct) {
        // Step 10-6D：保存并继续新增 — 保留分类/单位/库位/最低库存，重置其余字段
        setFormData(prev => ({
          name: '',
          sku: '',
          category: prev.category,
          currentStock: 0,
          minStock: prev.minStock,
          unit: prev.unit,
          location: prev.location,
          brand: '',
          specification: '',
          supplier: '',
          notes: '',
          purchasePrice: '',
          salePrice: ''
        }));
        setSkuError(null);
        setNameWarning(null);
        setNameSpecWarning(null);
        setSaveError(null);
        setActionMessage({ type: 'success', text: '产品已添加，可继续录入下一产品' });
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        handleCloseModal();
        setActionMessage({ type: 'success', text: editingProduct ? '产品已更新' : '产品已添加' });
        // 3 秒后自动清除成功提示
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (error) {
      console.error('保存产品失败:', error);
      setIsSaving(false);
      // 根据错误类型给出友好提示
      const errMsg = error.message || '';
      if (errMsg.includes('完全重复') || errMsg.includes('重复的库存产品')) {
        setSaveError(error.message);
      } else {
        setSaveError('保存失败，请稍后重试');
      }
      // 降级使用原同步方法，保持向后兼容
      try {
        if (editingProduct) {
          const updates = {
            ...formData,
            currentStock: Number(formData.currentStock) || 0,
            minStock: Number(formData.minStock) || 0,
            location: formData.location.trim(),
            brand: formData.brand.trim(),
            specification: formData.specification.trim(),
            supplier: formData.supplier.trim(),
            notes: formData.notes.trim(),
            purchasePrice: formData.purchasePrice !== '' ? Number(formData.purchasePrice) : null,
            salePrice: formData.salePrice !== '' ? Number(formData.salePrice) : null,
            lastUpdated: getToday()
          };
          const updatedProduct = updateProduct(editingProduct.id, updates);
          if (updatedProduct) {
            updatedProduct.status = calculateProductStatus(updatedProduct);
            setAllProducts(allProducts.map(p =>
              p.id === editingProduct.id ? updatedProduct : p
            ));
            setSaveError(null);
            handleCloseModal();
            setActionMessage({ type: 'success', text: '产品已更新' });
            setTimeout(() => setActionMessage(null), 3000);
          }
        } else {
          const newProductData = {
            sku: formData.sku.trim(),
            name: formData.name.trim(),
            category: formData.category,
            currentStock: Number(formData.currentStock) || 0,
            minStock: Number(formData.minStock) || 0,
            unit: formData.unit,
            location: formData.location.trim(),
            brand: formData.brand.trim(),
            specification: formData.specification.trim(),
            supplier: formData.supplier.trim(),
            notes: formData.notes.trim(),
            purchasePrice: formData.purchasePrice !== '' ? Number(formData.purchasePrice) : null,
            salePrice: formData.salePrice !== '' ? Number(formData.salePrice) : null,
            lastUpdated: getToday()
          };
          const newProduct = addProduct(newProductData);
          newProduct.status = calculateProductStatus(newProduct);
          setAllProducts([...allProducts, newProduct]);

          if (keepModalOpen) {
            // 降级模式下的"保存并继续"
            setFormData(prev => ({
              name: '',
              sku: '',
              category: prev.category,
              currentStock: 0,
              minStock: prev.minStock,
              unit: prev.unit,
              location: prev.location,
              brand: '',
              specification: '',
              supplier: '',
              notes: '',
              purchasePrice: '',
              salePrice: ''
            }));
            setSkuError(null);
            setNameWarning(null);
            setNameSpecWarning(null);
            setSaveError(null);
            setActionMessage({ type: 'success', text: '产品已添加，可继续录入下一产品' });
            setTimeout(() => setActionMessage(null), 3000);
          } else {
            setSaveError(null);
            handleCloseModal();
            setActionMessage({ type: 'success', text: '产品已添加' });
            setTimeout(() => setActionMessage(null), 3000);
          }
        }
      } catch (fallbackError) {
        console.error('降级保存也失败:', fallbackError);
        // 保持 saveError 的提示
      }
    }
  };

  // Step 10-27C: 七字段复合键完全重复前端预检查
  // 品牌+货号+名称+规格+单位+分类+存放位置全部相同时才判定为重复。
  // 同货号不同规格/库位/品牌允许共存。
  const checkSkuDuplicate = (currentProductId = null) => {
    const { sku, name, brand, specification, unit, category, location } = formData;
    if (!sku || !sku.trim()) {
      setSkuError(null);
      return;
    }
    const norm = (v) => (v || '').trim().toLowerCase();
    const duplicate = allProducts.find(
      p => norm(p.sku) === norm(sku)
        && norm(p.name) === norm(name)
        && norm(p.brand) === norm(brand)
        && norm(p.specification) === norm(specification)
        && norm(p.unit) === norm(unit)
        && norm(p.category) === norm(category)
        && norm(p.location) === norm(location)
        && p.id !== currentProductId
    );
    if (duplicate) {
      setSkuError(
        `完全重复的库存产品（ID: ${duplicate.id}，名称: ${duplicate.name}），`
        + '品牌/货号/名称/规格/单位/类别/库位均相同。同货号不同规格/库位可正常创建。'
      );
    } else {
      setSkuError(null);
    }
  };

  // Step 10-6D：产品名称重复轻提示
  const checkNameDuplicate = (nameValue, specValue, currentProductId = null) => {
    if (!nameValue || !nameValue.trim()) {
      setNameWarning(null);
      setNameSpecWarning(null);
      return;
    }
    const trimmedName = nameValue.trim();
    const trimmedSpec = specValue ? specValue.trim() : '';
    const sameName = allProducts.find(
      p => p.name.trim() === trimmedName && p.id !== currentProductId
    );
    if (!sameName) {
      setNameWarning(null);
      setNameSpecWarning(null);
      return;
    }
    // 名称相同
    const specMatch = sameName.specification && trimmedSpec &&
      sameName.specification.trim() === trimmedSpec;
    if (specMatch) {
      setNameWarning(null);
      setNameSpecWarning('已存在相同产品名称和规格的产品，请确认是否为重复录入。');
    } else {
      setNameSpecWarning(null);
      setNameWarning('已存在相同产品名称，请确认是否为不同规格或重复录入。');
    }
  };

  // 表单字段变化处理（含库存分类→库位联动、SKU/名称重复检查）
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updates = { ...prev, [name]: value };
      // 当库存分类变化时，自动设置为该分类的默认库位
      // 规则：2楼/3楼→清空（用户自选），刘晓冬/尚工→"专用区域"
      if (name === 'category') {
        updates.location = getDefaultLocationByCategory(value);
      }
      return updates;
    });

    // Step 10-27C: 七字段复合键实时重复检查
    const compositeFields = ['sku', 'name', 'brand', 'specification', 'unit', 'category', 'location'];
    if (compositeFields.includes(name)) {
      checkSkuDuplicate(editingProduct ? editingProduct.id : null);
    }
    if (name === 'name' || name === 'specification') {
      const newName = name === 'name' ? value : formData.name;
      const newSpec = name === 'specification' ? value : formData.specification;
      checkNameDuplicate(newName, newSpec, editingProduct ? editingProduct.id : null);
    }
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
    if (!canWrite) return; // viewer 不可删除
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    // Step 10-20C：打开系统内确认弹窗，代替原生 confirm
    setDeleteError('');
    setDeleteConfirmProduct(product);
  };

  // Step 10-20C：确认删除（弹窗内点击"确认删除"后调用）
  const handleConfirmDelete = async () => {
    if (!canWrite || deletingId) return;
    const product = deleteConfirmProduct;
    if (!product) return;

    setDeleteError('');
    setDeletingId(product.id);
    try {
      await dataProductService.deleteProduct(product.id);
      // API 删除成功
      setAllProducts(prev => prev.filter(p => p.id !== product.id));
      setActionMessage({ type: 'success', text: '产品已删除' });
      setTimeout(() => setActionMessage(null), 3000);
      setDeleteConfirmProduct(null);
    } catch (error) {
      // Step 10-20C：API 失败时不再静默降级到 localStorage
      const errMsg = error.message || '';
      if (errMsg.includes('409') || errMsg.includes('出入库记录') || errMsg.includes('不能直接删除')) {
        setDeleteError('该产品已有出入库记录，不能直接删除。请保留产品档案以保证库存台账完整。');
      } else {
        setDeleteError(errMsg || '删除失败，请稍后重试或联系管理员。');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Step 10-20C：关闭删除确认弹窗
  const handleCancelDelete = () => {
    setDeleteConfirmProduct(null);
    setDeleteError('');
  };

  // 打开台账弹窗
  const handleOpenLedgerModal = async (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    setSelectedProductForLedger(product);
    setIsLoadingLedger(true);
    setLedgerModalOpen(true);

    try {
      const ledger = await dataProductService.getProductInventoryLedger(productId);
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
        {/* 第一行：新增按钮 + 导出按钮 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          {/* 左侧：新增产品按钮 */}
          <button
            onClick={handleAddProduct}
            disabled={!canWrite}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-4 py-2 rounded-md transition-colors font-medium ${
              !canWrite
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-slate-700 text-white hover:bg-slate-800'
            }`}
          >
            + 新增产品
          </button>

          {/* 右侧：导出按钮 */}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleExport}
              disabled={!canWrite || filteredProducts.length === 0}
              title={!canWrite ? adminOnlyTitle : ''}
              className={`px-4 py-2 border rounded-md transition-colors font-medium ${
                !canWrite || filteredProducts.length === 0
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              导出 CSV
            </button>
            {/* Step 10-6D：导出核对轻提示 */}
            <p className="text-xs text-slate-400">录入完成后建议导出 CSV，与旧系统/腾讯文档反向核对。</p>
          </div>
        </div>

        {/* 第二行：搜索与主筛选 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start">
          {/* 搜索框 */}
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索货号 / SKU / 产品名称"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setCurrentPage(1);
              }
            }}
            className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
          />

          {/* 品牌筛选 */}
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
          >
            <option value="all">全部品牌</option>
            {(() => {
              const brands = [...new Set(
                allProducts
                  .map(p => p.brand)
                  .filter(b => b && b.trim() !== '')
              )].sort();
              return brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ));
            })()}
          </select>

          {/* 库存分类筛选 */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              const newCat = e.target.value;
              setSelectedCategory(newCat);
              // 切换库存分类时，如果当前库位不属于新分类，自动重置为"全部库位"
              if (newCat !== 'all' && selectedLocation !== 'all') {
                const validLocations = getLocationOptionsByCategory(newCat);
                if (validLocations.length > 0 && !validLocations.includes(selectedLocation)) {
                  setSelectedLocation('all');
                }
              }
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
          >
            {buildCategoryOptions(allProducts).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* 库位筛选（随库存分类联动） */}
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
          >
            <option value="all">全部库位</option>
            {(() => {
              if (selectedCategory === 'all') {
                // 全部库存分类：展示所有产品中出现的全部库位
                const allLocations = [...new Set(
                  allProducts
                    .map(p => p.location)
                    .filter(l => l && l.trim() !== '')
                )].sort();
                return allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ));
              }
              return getLocationOptionsByCategory(selectedCategory).map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ));
            })()}
          </select>

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-2 items-start">
            <button
              onClick={handleSearch}
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors text-sm font-medium w-full sm:w-auto"
            >
              搜索
            </button>
            {activeFilters && (
              <button
                onClick={handleReset}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors w-full sm:w-auto"
              >
                重置筛选
              </button>
            )}
          </div>
        </div>

        {/* 第三行：高级筛选 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          {/* 库存状态筛选 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              库存状态
            </label>
            <div className="flex flex-wrap gap-1">
              {[
                { value: 'all', label: '全部' },
                { value: '正常', label: '正常' },
                { value: '低库存', label: '低库存' }
              ].map((status) => (
                <button
                  key={status.value}
                  type="button"
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    selectedStatus === status.value
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  onClick={() => setSelectedStatus(status.value)}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* 核对状态筛选 */}
          <div>
            <label htmlFor="verification-filter" className="block text-sm font-medium text-slate-700 mb-1.5">
              核对状态
            </label>
            <select
              id="verification-filter"
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
            >
              <option value="all">全部核对状态</option>
              <option value="信息完整">信息完整</option>
              <option value="建议补充">建议补充</option>
              <option value="需核对">需核对</option>
            </select>
          </div>

          {/* 当前库存最小值 */}
          <div>
            <label htmlFor="min-stock" className="block text-sm font-medium text-slate-700 mb-1.5">
              库存最小值
            </label>
            <input
              id="min-stock"
              type="number"
              min="0"
              placeholder="最小值"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
          </div>

          {/* 当前库存最大值 */}
          <div>
            <label htmlFor="max-stock" className="block text-sm font-medium text-slate-700 mb-1.5">
              库存最大值
            </label>
            <input
              id="max-stock"
              type="number"
              min="0"
              placeholder="最大值"
              value={maxStock}
              onChange={(e) => setMaxStock(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* 数据加载状态 */}
      {isLoading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <div className="text-blue-700 font-medium">正在加载产品数据...</div>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <div className="text-amber-800 font-medium">数据加载异常</div>
              <div className="text-amber-700 text-sm mt-1">{error}</div>
              <div className="text-amber-600 text-xs mt-2">系统已自动降级使用本地数据，功能不受影响。</div>
            </div>
          </div>
        </div>
      )}

      {/* 操作反馈提示（成功/失败） */}
      {actionMessage && (
        <div className={`mb-6 p-3 rounded-md border transition-opacity ${
          actionMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center">
            {actionMessage.type === 'success' ? (
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* 产品表格 */}
      {allProducts.length > 0 && (
        <div className="mb-6">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 md:px-6 md:py-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800">产品核对概览</div>
                <div className="text-xs text-slate-500 mt-0.5">用于快速了解产品资料完整性，便于日常维护和后续核对，不影响库存计算。</div>
              </div>
              <div className="flex items-center gap-4 md:gap-6">
                {(() => {
                  const okCount = filteredProducts.filter(p => calculateVerificationStatus(p) === '信息完整').length;
                  const warnCount = filteredProducts.filter(p => calculateVerificationStatus(p) === '建议补充').length;
                  const badCount = filteredProducts.filter(p => calculateVerificationStatus(p) === '需核对').length;
                  return (
                    <>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-slate-600">{okCount}</div>
                        <div className="text-xs text-slate-500">信息完整</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-amber-600">{warnCount}</div>
                        <div className="text-xs text-slate-500">建议补充</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-rose-600">{badCount}</div>
                        <div className="text-xs text-slate-500">需核对</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            {filteredProducts.length > 0 && (
              <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                当前筛选结果共 {filteredProducts.length} 个产品
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg">
        {allProducts.length === 0 ? (
          // 系统暂无产品
          <div className="py-12 text-center">
            <div className="text-slate-500 mb-2">暂无数据</div>
            <div className="text-sm text-slate-500 max-w-md mx-auto">
              点击"新增产品"按钮添加第一条产品记录。
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          // 筛选无结果
          <div className="py-12 text-center">
            <div className="text-slate-500 mb-2">未找到匹配的产品</div>
            <div className="text-sm text-slate-500 max-w-md mx-auto mb-4">
              当前筛选条件下未找到匹配的产品。请尝试：
            </div>
            <div className="text-sm text-slate-600 max-w-md mx-auto space-y-1">
              <p>• 调整搜索关键词（货号 / SKU / 产品名称）</p>
              <p>• 选择不同的品牌</p>
              <p>• 选择不同的库存分类</p>
              <p>• 选择不同的存储位置 / 库位</p>
              <p>• 调整库存状态筛选</p>
              <p>• 调整核对状态筛选</p>
              <p>• 调整库存数量范围</p>
              <p>• 点击"重置筛选"查看全部产品</p>
            </div>
            {activeFilters && (
              <button
                type="button"
                className="mt-6 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors"
                onClick={handleReset}
              >
                重置筛选
              </button>
            )}
          </div>
        ) : (
          <>
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
                      库存分类
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
                      核对状态
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
                      <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                        <VerificationBadge status={calculateVerificationStatus(product)} />
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4">
                        <div className="text-sm text-slate-700">{product.location}</div>
                        <div className="text-xs text-slate-500 mt-1">更新: {product.lastUpdated}</div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditProduct(product.id)}
                            disabled={!canWrite}
                            title={!canWrite ? adminOnlyTitle : ''}
                            className={`px-3 py-1.5 text-sm rounded transition-colors ${
                              !canWrite
                                ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleOpenLedgerModal(product.id)}
                            className="px-3 py-1.5 text-sm bg-slate-50 text-slate-600 rounded border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            台账
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            disabled={!canWrite || deletingId === product.id}
                            title={!canWrite ? adminOnlyTitle : ''}
                            className={`px-3 py-1.5 text-sm rounded transition-colors ${
                              !canWrite
                                ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                                : deletingId === product.id
                                  ? 'bg-rose-50 text-rose-400 cursor-wait'
                                  : 'bg-slate-50 text-rose-600 border border-rose-200 hover:bg-rose-50'
                            }`}
                          >
                            {deletingId === product.id ? '删除中...' : '删除'}
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
          </>
        )}
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：点击"编辑"可修改产品信息，点击"删除"将移除该产品记录。低库存状态的产品会以橙色标识。
        </div>
      </div>

      {/* 导出前安全检查模态框 */}
      {showPreflightModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">导出前安全检查</h2>
              <p className="text-sm text-slate-500 mt-1">在导出产品数据前检查数据库完整性</p>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              {/* 检查中 */}
              {isPreflightChecking && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mr-3"></div>
                  <span className="text-slate-600">正在检查数据库状态...</span>
                </div>
              )}

              {/* 检查失败 */}
              {preflightError && !isPreflightChecking && (
                <div className="p-3 rounded-md border bg-rose-50 border-rose-200">
                  <div className="text-rose-800 font-medium mb-1">检查请求失败</div>
                  <div className="text-sm text-rose-700">{preflightError}</div>
                </div>
              )}

              {/* 检查结果 */}
              {preflightResult && !isPreflightChecking && (
                <>
                  {/* 状态横幅 */}
                  <div className={`p-3 rounded-md border text-sm ${
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
                      {preflightResult.status === 'ok' && '✅ 检查通过 — 可以安全导出'}
                      {preflightResult.status === 'warning' && '⚠️ 存在警告 — 仍可导出，但建议先处理'}
                      {preflightResult.status === 'error' && '❌ 存在错误 — 导出有风险，请确认后再操作'}
                    </div>
                    <div className="space-y-1 text-slate-700">
                      <div className="flex gap-2">
                        <span className="text-slate-500 shrink-0">产品数：</span>
                        <span>{preflightResult.products_count}</span>
                        <span className="text-slate-400 mx-1">|</span>
                        <span className="text-slate-500">交易数：</span>
                        <span>{preflightResult.transactions_count}</span>
                        <span className="text-slate-400 mx-1">|</span>
                        <span className="text-slate-500">日志数：</span>
                        <span>{preflightResult.audit_logs_count}</span>
                      </div>
                      {/* 异常项 */}
                      {(preflightResult.negative_stock_count > 0 ||
                        preflightResult.transactions_missing_product_id_count > 0 ||
                        preflightResult.transactions_orphan_product_id_count > 0 ||
                        preflightResult.duplicate_sku_count > 0) && (
                        <div className="flex gap-2 mt-1">
                          <span className="text-slate-500 shrink-0">异常：</span>
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
                    {/* Warnings 明细 */}
                    {preflightResult.warnings && preflightResult.warnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-200">
                        <div className="text-xs font-medium text-amber-700 mb-1">警告明细：</div>
                        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                          {preflightResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Errors 明细 */}
                    {preflightResult.errors && preflightResult.errors.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-rose-200">
                        <div className="text-xs font-medium text-rose-700 mb-1">错误明细：</div>
                        <ul className="text-xs text-rose-700 space-y-0.5 list-disc list-inside">
                          {preflightResult.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 权限提示 */}
                  {!canWrite && (
                    <div className="p-3 rounded-md border bg-slate-50 border-slate-200 text-sm text-slate-600">
                      ℹ️ 当前为只读权限，仅可查看检查结果。如需创建备份，请联系管理员。
                    </div>
                  )}
                </>
              )}

              {/* 检查失败但可跳过 */}
              {preflightError && !isPreflightChecking && (
                <div className="p-3 rounded-md border bg-amber-50 border-amber-200 text-sm text-amber-700">
                  安全检查未完成，仍可继续导出，但建议确认数据状态后再操作。
                </div>
              )}

              {/* 备份失败错误提示 */}
              {backupExportError && (
                <div className="p-3 rounded-md border bg-rose-50 border-rose-200">
                  <div className="flex items-start">
                    <svg className="w-4 h-4 text-rose-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-rose-700">{backupExportError}</div>
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作按钮 */}
            <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setShowPreflightModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
              >
                取消
              </button>
              {/* admin 始终可见：创建备份后再导出 */}
              {canWrite && !isPreflightChecking && (
                <button
                  onClick={handleBackupThenExport}
                  disabled={isBackupBeforeExport}
                  className={`px-4 py-2 rounded-md transition-colors font-medium ${
                    isBackupBeforeExport
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : 'bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {isBackupBeforeExport ? '备份中...' : '创建备份后导出'}
                </button>
              )}
              <button
                onClick={handleConfirmExport}
                disabled={isPreflightChecking}
                className={`px-4 py-2 rounded-md transition-colors font-medium ${
                  isPreflightChecking
                    ? 'bg-slate-400 text-white cursor-not-allowed'
                    : preflightResult?.status === 'error'
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-slate-700 text-white hover:bg-slate-800'
                }`}
                title={preflightResult?.status === 'error' ? '存在错误，导出有风险，请确认后继续' : ''}
              >
                {preflightResult?.status === 'error' ? '已知风险，继续导出' : '继续导出'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent ${
                      nameSpecWarning ? 'border-amber-400 bg-amber-50' : nameWarning ? 'border-amber-300 bg-amber-50' : 'border-slate-300'
                    }`}
                    placeholder="请输入产品名称"
                  />
                  {nameWarning && !nameSpecWarning && (
                    <p className="mt-1 text-sm text-amber-600 font-medium">{nameWarning}</p>
                  )}
                  {nameSpecWarning && (
                    <p className="mt-1 text-sm text-amber-700 font-medium">{nameSpecWarning}</p>
                  )}
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
                    className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent ${
                      skuError ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="如：PRD-2026001"
                  />
                  {skuError && (
                    <p className="mt-1 text-sm text-rose-600 font-medium">{skuError}</p>
                  )}
                </div>

                {/* 库存分类和单位 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      库存分类
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                    >
                      {(() => {
                        // 构建模态框分类选项：真实库存分类 + 编辑中的旧分类（如有）
                        const modalCategories = [...INVENTORY_CATEGORIES];
                        if (
                          editingProduct &&
                          editingProduct.category &&
                          !INVENTORY_CATEGORIES.includes(editingProduct.category)
                        ) {
                          modalCategories.push(editingProduct.category);
                        }
                        return modalCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ));
                      })()}
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

                {/* 存储位置（库存分类联动） */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    存储位置
                  </label>
                  {(() => {
                    const locationOptions = getLocationOptionsByCategory(formData.category);
                    if (locationOptions.length > 0) {
                      // 真实库存分类 → 显示库位下拉选择
                      return (
                        <select
                          name="location"
                          value={formData.location}
                          onChange={handleFormChange}
                          className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                        >
                          <option value="">-- 请选择库位 --</option>
                          {locationOptions.map((loc) => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      );
                    }
                    // 旧分类或无分类 → 自由文本输入
                    return (
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                        placeholder="如：A区-1排-2层"
                      />
                    );
                  })()}
                </div>

                {/* P1 扩展字段（Step 10-2B） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      品牌
                    </label>
                    <input
                      type="text"
                      name="brand"
                      value={formData.brand}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="如：安捷伦"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      规格
                    </label>
                    <input
                      type="text"
                      name="specification"
                      value={formData.specification}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="如：1.5×100mm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      供应商
                    </label>
                    <input
                      type="text"
                      name="supplier"
                      value={formData.supplier}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="如：上海某某化工"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      备注
                    </label>
                    <input
                      type="text"
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="产品备注说明"
                    />
                  </div>
                </div>

                {/* P1 价格字段（Step 10-6C） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      采购价
                    </label>
                    <input
                      type="number"
                      name="purchasePrice"
                      value={formData.purchasePrice}
                      onChange={handleFormChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="如：12.50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      售价
                    </label>
                    <input
                      type="number"
                      name="salePrice"
                      value={formData.salePrice}
                      onChange={handleFormChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="如：25.00"
                    />
                  </div>
                </div>

              </div>

              {/* Step 10-9A：正式录入核对提示区 */}
              {(() => {
                const hints = getVerificationHints(formData);
                return (
                  <div className={`mx-6 mt-3 p-3 rounded-md border ${hints.bg} ${hints.border}`}>
                    <div className="flex items-start">
                      <span className={`text-xs font-medium mr-2 mt-0.5 shrink-0 ${hints.textColor}`}>
                        {hints.status === '信息完整' ? '✓' : hints.status === '建议补充' ? '△' : '!'}
                      </span>
                      <div>
                        <div className={`text-xs font-medium mb-0.5 ${hints.textColor}`}>
                          核对状态：{hints.status}
                        </div>
                        <div className={`text-xs leading-relaxed ${hints.hintColor}`}>
                          {hints.message}
                        </div>
                        {hints.priceNote && (
                          <div className="text-xs text-slate-500 mt-1.5 pt-1.5 border-t border-slate-200">
                            {hints.priceNote}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 保存错误提示 */}
              {saveError && (
                <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-md">
                  <div className="flex items-start">
                    <svg className="w-4 h-4 text-rose-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-rose-700">{saveError}</div>
                  </div>
                </div>
              )}

              {/* 模态框底部按钮 */}
              <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className={`px-4 py-2 border rounded-md transition-colors font-medium ${
                    isSaving
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  取消
                </button>
                {/* Step 10-6D：保存并继续新增（仅新增模式可用，编辑模式不显示） */}
                {!editingProduct && (
                  <button
                    type="button"
                    onClick={(e) => handleFormSubmit(e, true)}
                    disabled={isSaving || !!skuError}
                    title={skuError ? '请先解决 SKU 重复问题' : ''}
                    className={`px-4 py-2 border rounded-md transition-colors font-medium ${
                      isSaving || skuError
                        ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'border-slate-400 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isSaving ? '保存中...' : '保存并继续新增'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSaving || !!skuError}
                  title={skuError ? '请先解决 SKU 重复问题' : ''}
                  className={`px-4 py-2 rounded-md transition-colors font-medium ${
                    isSaving || skuError
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : 'bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSaving ? '保存中...' : editingProduct ? '更新产品' : '添加产品'}
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
                              状态
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
                                  <LedgerStatusBadge status={entry.status} />
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
                                  <div className="text-sm text-slate-700 max-w-xs">
                                    {entry.notes || '-'}
                                    {entry.status === 'reversed' && (
                                      <div className="text-xs text-slate-500 mt-1">已撤销，不计入库存</div>
                                    )}
                                  </div>
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
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-1 rounded text-xs font-medium border ${typeConfig.color}`}>
                                {typeConfig.label}
                              </span>
                              <LedgerStatusBadge status={entry.status} />
                            </div>
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

                          <div>
                            <div className="text-xs text-slate-500 mb-1">摘要说明</div>
                            <div className="text-sm text-slate-700">
                              {entry.notes || '-'}
                              {entry.status === 'reversed' && (
                                <div className="text-xs text-slate-500 mt-1">已撤销，不计入库存</div>
                              )}
                            </div>
                          </div>
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

      {/* Step 10-20C：删除产品确认弹窗 */}
      {deleteConfirmProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">确认删除产品</h2>
            </div>
            <div className="p-6 space-y-3">
              {/* 产品信息 */}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">产品名称</span>
                <span className="text-sm font-medium text-slate-800">{deleteConfirmProduct.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">SKU</span>
                <span className="text-sm font-medium text-slate-800">{deleteConfirmProduct.sku || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">当前库存</span>
                <span className="text-sm font-medium text-slate-800">
                  {deleteConfirmProduct.currentStock}{deleteConfirmProduct.unit ? ` ${deleteConfirmProduct.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">库存分类</span>
                <span className="text-sm font-medium text-slate-800">{deleteConfirmProduct.category || '—'}</span>
              </div>
              {/* 风险提示 */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="text-sm text-amber-800 leading-relaxed">
                  删除后该产品将不再出现在产品列表中。已有出入库记录的产品系统会阻止删除，以保证台账完整。
                </div>
              </div>
              {/* 删除错误 */}
              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md">
                  <div className="text-sm text-rose-700 leading-relaxed">{deleteError}</div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={handleCancelDelete}
                disabled={!!deletingId}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!!deletingId}
                className={`px-4 py-2 text-white rounded-md transition-colors font-medium ${
                  deletingId
                    ? 'bg-rose-300 cursor-wait'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {deletingId ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;