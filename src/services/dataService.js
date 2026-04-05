/**
 * 统一数据服务层
 * 支持 mock/localStorage 和 API 两种数据源模式切换
 */

// 数据源模式配置
const DATA_SOURCE_MODE = {
  MOCK: 'mock',
  API: 'api'
};

// 当前使用的数据源模式（开发包B：测试时可切换到API模式）
let currentMode = DATA_SOURCE_MODE.API; // 暂时设置为API模式进行测试

// API 基础配置
const API_CONFIG = {
  BASE_URL: 'http://localhost:8001/api',
  TIMEOUT: 10000,
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};

/**
 * 设置数据源模式
 * @param {string} mode - 'mock' 或 'api'
 */
export const setDataSourceMode = (mode) => {
  if (Object.values(DATA_SOURCE_MODE).includes(mode)) {
    currentMode = mode;
    console.log(`[dataService] 数据源模式已切换为: ${mode}`);
  } else {
    console.warn(`[dataService] 无效的数据源模式: ${mode}`);
  }
};

/**
 * 获取当前数据源模式
 * @returns {string} 当前模式
 */
export const getDataSourceMode = () => currentMode;

/**
 * 统一 API 请求封装
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...API_CONFIG.DEFAULT_HEADERS,
        ...options.headers
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[dataService] API 请求失败: ${endpoint}`, error);

    // 如果 API 失败，自动降级到 mock 模式
    if (currentMode === DATA_SOURCE_MODE.API) {
      console.warn(`[dataService] API 请求失败，自动降级到 mock 模式`);
      currentMode = DATA_SOURCE_MODE.MOCK;
    }

    throw error;
  }
};

/**
 * 产品相关数据服务
 */
export const productService = {
  /**
   * 获取所有产品
   * @returns {Promise<Array>} 产品列表
   */
  async getAllProducts() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      // 使用现有的 productService（保持向后兼容）
      const { getAllProducts } = await import('./productService.js');
      return getAllProducts();
    } else {
      // API 模式
      const data = await apiRequest('/products/');
      return data;
    }
  },

  /**
   * 获取产品详情
   * @param {string} id - 产品ID
   * @returns {Promise<Object>} 产品详情
   */
  async getProductById(id) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { getProductById } = await import('./productService.js');
      return getProductById(id);
    } else {
      const data = await apiRequest(`/products/${id}`);
      return data;
    }
  },

  /**
   * 创建新产品
   * @param {Object} productData - 产品数据
   * @returns {Promise<Object>} 创建的产品
   */
  async addProduct(productData) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { addProduct } = await import('./productService.js');
      return addProduct(productData);
    } else {
      const data = await apiRequest('/products/', {
        method: 'POST',
        body: JSON.stringify(productData)
      });
      return data;
    }
  },

  /**
   * 更新产品
   * @param {string} id - 产品ID
   * @param {Object} updates - 更新字段
   * @returns {Promise<Object>} 更新后的产品
   */
  async updateProduct(id, updates) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { updateProduct } = await import('./productService.js');
      return updateProduct(id, updates);
    } else {
      const data = await apiRequest(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      return data;
    }
  },

  /**
   * 删除产品
   * @param {string} id - 产品ID
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteProduct(id) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { deleteProduct } = await import('./productService.js');
      return deleteProduct(id);
    } else {
      await apiRequest(`/products/${id}`, {
        method: 'DELETE'
      });
      return true;
    }
  },

  /**
   * 获取带计算状态的产品列表
   * @returns {Promise<Array>} 带状态的产品列表
   */
  async getProductsWithCalculatedStatus() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { getProductsWithCalculatedStatus } = await import('./productService.js');
      return getProductsWithCalculatedStatus();
    } else {
      const products = await this.getAllProducts();
      // 计算状态
      return products.map(product => ({
        ...product,
        status: this.calculateProductStatus(product)
      }));
    }
  },

  /**
   * 计算产品状态
   * @param {Object} product - 产品对象
   * @returns {string} '正常' 或 '低库存'
   */
  calculateProductStatus(product) {
    const current = Number(product.currentStock) || 0;
    const min = Number(product.minStock) || 0;
    return current <= min ? '低库存' : '正常';
  }
};

/**
 * 交易记录相关数据服务
 */
export const transactionService = {
  /**
   * 获取所有交易记录
   * @returns {Promise<Array>} 交易记录列表
   */
  async getTransactions() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { getTransactions } = await import('./productService.js');
      return getTransactions();
    } else {
      const data = await apiRequest('/transactions/');
      return data;
    }
  },

  /**
   * 创建交易记录
   * @param {Object} transactionData - 交易数据
   * @returns {Promise<Object>} 创建的记录
   */
  async addTransaction(transactionData) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { addTransaction } = await import('./productService.js');
      return addTransaction(transactionData);
    } else {
      const data = await apiRequest('/transactions/', {
        method: 'POST',
        body: JSON.stringify(transactionData)
      });
      return data;
    }
  }
};

/**
 * 审计日志相关数据服务
 */
export const auditLogService = {
  /**
   * 获取所有审计日志
   * @returns {Promise<Array>} 审计日志列表
   */
  async getAuditLogs() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { getAuditLogs } = await import('./productService.js');
      return getAuditLogs();
    } else {
      const data = await apiRequest('/audit-logs/');
      return data;
    }
  }
};

/**
 * 仪表盘相关数据服务
 */
export const dashboardService = {
  /**
   * 获取仪表盘统计数据
   * @returns {Promise<Object>} 统计数据
   */
  async getDashboardStats() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      // 使用 mock 数据
      const { dashboardStats } = await import('../constants/mockData.js');
      return dashboardStats;
    } else {
      const data = await apiRequest('/dashboard/stats');
      // 转换为前端需要的格式
      return [
        {
          id: 'total-products',
          title: '产品总数',
          value: data.total_products.toString(),
          change: '+0',
          changeType: 'neutral',
          description: '实时数据',
          iconColor: 'bg-slate-600',
        },
        {
          id: 'normal-stock',
          title: '正常库存',
          value: data.normal_stock_count.toString(),
          change: '+0',
          changeType: 'neutral',
          description: '库存正常产品数',
          iconColor: 'bg-emerald-500',
        },
        {
          id: 'low-stock-alerts',
          title: '低库存预警',
          value: data.low_stock_count.toString(),
          change: '+0',
          changeType: 'neutral',
          description: '需及时补货',
          iconColor: 'bg-amber-500',
        },
        {
          id: 'recent-transactions',
          title: '近7日交易记录',
          value: data.recent_transactions_count.toString(),
          change: '+0',
          changeType: 'neutral',
          description: '交易活动',
          iconColor: 'bg-blue-500',
        },
        {
          id: 'recent-audit-logs',
          title: '近7日审计记录',
          value: data.recent_audit_logs_count.toString(),
          change: '+0',
          changeType: 'neutral',
          description: '系统活动',
          iconColor: 'bg-violet-500',
        },
      ];
    }
  }
};

// 默认导出常用服务
export default {
  setDataSourceMode,
  getDataSourceMode,
  productService,
  transactionService,
  auditLogService,
  dashboardService
};