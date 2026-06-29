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
  BASE_URL: '/api',
  TIMEOUT: 10000,
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};

/**
 * 获取认证请求头（包含 Bearer token，如果已登录）
 * @returns {Object} 包含 Authorization 的 headers 对象
 */
const getAuthHeaders = () => {
  const headers = {};
  try {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return headers;
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

// 字段映射配置：将API返回的字段名映射为前端期望的字段名
const FIELD_MAPPING = {
  // 产品字段映射
  id: 'id',
  sku: 'sku',
  name: 'name',
  category: 'category',
  current_stock: 'currentStock',
  min_stock: 'minStock',
  unit: 'unit',
  location: 'location',
  last_updated: 'lastUpdated',
  // P1 扩展字段（Step 10-2B）
  brand: 'brand',
  specification: 'specification',
  supplier: 'supplier',
  // notes 映射保持为 notes（与 Transaction notes 共享）
  // 交易记录字段映射
  transaction_id: 'id',
  product_id: 'productId',
  product_name: 'productName',
  transaction_type: 'type',
  transaction_date: 'date',
  quantity: 'quantity',
  operator: 'operator',
  notes: 'notes',
  status: 'status',
  created_at: 'createdAt',
  // 审计日志字段映射
  action_type: 'actionType',
  timestamp: 'timestamp',
  details: 'details',
  // 用户字段映射
  username: 'username',
  display_name: 'displayName',
  email: 'email',
  role: 'role',
  is_active: 'isActive',
  user_status: 'status',
  last_login: 'lastLogin'
};

/**
 * 规范化产品对象，确保字段名与前端期望一致
 * @param {Object} product - API返回的产品对象
 * @returns {Object} 规范化后的产品对象
 */
const normalizeProduct = (product) => {
  if (!product || typeof product !== 'object') return product;

  const normalized = {};

  // 遍历映射配置，处理字段名转换
  Object.entries(FIELD_MAPPING).forEach(([apiField, frontendField]) => {
    if (apiField in product) {
      normalized[frontendField] = product[apiField];
    }
  });

  // 保留未映射的字段
  Object.keys(product).forEach(key => {
    if (!(key in FIELD_MAPPING)) {
      normalized[key] = product[key];
    }
  });

  return normalized;
};

/**
 * 规范化产品列表
 * @param {Array} products - API返回的产品列表
 * @returns {Array} 规范化后的产品列表
 */
const normalizeProductList = (products) => {
  if (!Array.isArray(products)) return [];
  return products.map(normalizeProduct);
};

/**
 * 规范化交易记录对象，确保字段名与前端期望一致
 * @param {Object} transaction - API返回的交易对象
 * @returns {Object} 规范化后的交易对象
 */
const normalizeTransaction = (transaction) => {
  if (!transaction || typeof transaction !== 'object') return transaction;

  const normalized = {};

  // 遍历映射配置，处理字段名转换
  Object.entries(FIELD_MAPPING).forEach(([apiField, frontendField]) => {
    if (apiField in transaction) {
      normalized[frontendField] = transaction[apiField];
    }
  });

  // 保留未映射的字段
  Object.keys(transaction).forEach(key => {
    if (!(key in FIELD_MAPPING)) {
      normalized[key] = transaction[key];
    }
  });

  // 确保必要字段存在
  if (!normalized.id && transaction.transaction_id) {
    normalized.id = transaction.transaction_id;
  }
  if (!normalized.productId && transaction.product_id) {
    normalized.productId = transaction.product_id;
  }
  if (!normalized.type && transaction.transaction_type) {
    normalized.type = transaction.transaction_type;
  }
  if (!normalized.date && transaction.transaction_date) {
    normalized.date = transaction.transaction_date;
  }
  if (!normalized.createdAt && transaction.created_at) {
    normalized.createdAt = transaction.created_at;
  }

  return normalized;
};

/**
 * 规范化交易记录列表
 * @param {Array} transactions - API返回的交易列表
 * @returns {Array} 规范化后的交易列表
 */
const normalizeTransactionList = (transactions) => {
  if (!Array.isArray(transactions)) return [];
  return transactions.map(normalizeTransaction);
};

/**
 * 规范化审计日志对象，确保字段名与前端期望一致
 * @param {Object} auditLog - API返回的审计日志对象
 * @returns {Object} 规范化后的审计日志对象
 */
const normalizeAuditLog = (auditLog) => {
  if (!auditLog || typeof auditLog !== 'object') return auditLog;

  const normalized = {};

  // 遍历映射配置，处理字段名转换
  Object.entries(FIELD_MAPPING).forEach(([apiField, frontendField]) => {
    if (apiField in auditLog) {
      normalized[frontendField] = auditLog[apiField];
    }
  });

  // 保留未映射的字段
  Object.keys(auditLog).forEach(key => {
    if (!(key in FIELD_MAPPING)) {
      normalized[key] = auditLog[key];
    }
  });

  // 确保必要字段存在
  if (!normalized.timestamp && auditLog.created_at) {
    normalized.timestamp = auditLog.created_at;
  }
  if (!normalized.actionType && auditLog.action_type) {
    normalized.actionType = auditLog.action_type;
  }

  return normalized;
};

/**
 * 规范化审计日志列表
 * @param {Array} auditLogs - API返回的审计日志列表
 * @returns {Array} 规范化后的审计日志列表
 */
const normalizeAuditLogList = (auditLogs) => {
  if (!Array.isArray(auditLogs)) return [];
  return auditLogs.map(normalizeAuditLog);
};

/**
 * 规范化用户对象，确保字段名与前端期望一致
 * @param {Object} user - API返回的用户对象
 * @returns {Object} 规范化后的用户对象
 */
const normalizeUser = (user) => {
  if (!user || typeof user !== 'object') return user;

  const normalized = {};

  // 遍历映射配置，处理字段名转换
  Object.entries(FIELD_MAPPING).forEach(([apiField, frontendField]) => {
    if (apiField in user) {
      normalized[frontendField] = user[apiField];
    }
  });

  // 保留未映射的字段
  Object.keys(user).forEach(key => {
    if (!(key in FIELD_MAPPING)) {
      normalized[key] = user[key];
    }
  });

  // 确保必要字段存在
  if (!normalized.id && user.user_id) {
    normalized.id = user.user_id;
  }
  if (!normalized.status && user.user_status) {
    normalized.status = user.user_status;
  }

  return normalized;
};

/**
 * 规范化用户列表
 * @param {Array} users - API返回的用户列表
 * @returns {Array} 规范化后的用户列表
 */
const normalizeUserList = (users) => {
  if (!Array.isArray(users)) return [];
  return users.map(normalizeUser);
};

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
        ...getAuthHeaders(),
        ...options.headers
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      // 401/403 时不静默降级到 mock，抛出明确错误
      if (status === 401) {
        console.error(`[dataService] 鉴权失败 (401): ${endpoint}`, errorText);
        throw new Error(`鉴权失败 (401): 请重新登录`);
      }
      if (status === 403) {
        console.error(`[dataService] 鉴权失败 (403): ${endpoint}`, errorText);
        throw new Error(`鉴权失败 (403): 仅管理员可操作，当前账号无权限，请联系管理员`);
      }

      throw new Error(`API 请求失败: ${status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    // 如果是网络错误或超时，不在 API 模式下静默降级
    if (error.name === 'AbortError') {
      console.error(`[dataService] API 请求超时: ${endpoint}`);
      throw new Error(`请求超时: ${endpoint}`);
    }

    console.error(`[dataService] API 请求失败: ${endpoint}`, error);

    // API 模式下不自动降级到 mock，让调用方决定如何处理错误
    // 生产环境不能静默显示假数据
    if (currentMode === DATA_SOURCE_MODE.API) {
      console.error(`[dataService] API 模式下请求失败，不降级：${endpoint}`);
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
      // 规范化字段名，确保与前端期望的字段名一致
      return normalizeProductList(data);
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
      // 规范化字段名，确保与前端期望的字段名一致
      return normalizeProduct(data);
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
      // 规范化字段名，确保与前端期望的字段名一致
      return normalizeProduct(data);
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
      // 规范化字段名，确保与前端期望的字段名一致
      return normalizeProduct(data);
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
      try {
        const products = await this.getAllProducts();
        // 计算状态
        return products.map(product => ({
          ...product,
          status: this.calculateProductStatus(product)
        }));
      } catch (error) {
        console.error('[dataService] 获取带状态产品列表失败:', error);
        // API 模式下不降级到 mock，保持错误状态让页面展示 error
        throw error;
      }
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
  },

  /**
   * 获取产品库存台账（基于真实交易记录生成）
   * @param {string} productId - 产品ID
   * @returns {Promise<Array>} 台账数据列表
   */
  async getProductInventoryLedger(productId) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { getProductInventoryLedger } = await import('./productService.js');
      return getProductInventoryLedger(productId);
    } else {
      // API模式：获取该产品的所有交易记录，转换为台账格式
      try {
        // 先获取所有交易记录
        const allTransactions = await apiRequest('/transactions/');
        // 过滤出该产品的交易记录，统一处理 product_id/productId 字段名和类型
        const productTransactions = allTransactions.filter(txn => {
          const txnProductId = txn.product_id !== undefined ? txn.product_id : txn.productId;
          // 统一转换为字符串比较
          return String(txnProductId) === String(productId);
        });

        // 获取产品当前库存
        let productCurrentStock = 0;
        try {
          const productData = await apiRequest(`/products/${productId}`);
          const normalizedProduct = normalizeProduct(productData);
          productCurrentStock = Number(normalizedProduct.currentStock) || 0;
        } catch (error) {
          console.warn(`[dataService] 无法获取产品 ${productId} 的当前库存，使用默认值 0`, error);
        }

        // 转换为台账格式
        const ledger = [];
        // 按时间倒序排序（最新在前），优先使用 transaction_date，其次 date，最后 created_at
        const sortedTransactions = [...productTransactions].sort((a, b) => {
          const dateA = a.transaction_date || a.date || a.created_at;
          const dateB = b.transaction_date || b.date || b.created_at;
          return new Date(dateB) - new Date(dateA);
        });

        // 计算所有 completed 交易的净变化总和，并收集每个交易的变化量
        let totalNetChange = 0;
        const transactionChanges = {};
        // 按时间正序（从最早到最新）计算
        const chronologicalTransactions = [...sortedTransactions].reverse();
        for (const txn of chronologicalTransactions) {
          const normalizedTxn = normalizeTransaction(txn);
          let stockChange = 0;
          if (normalizedTxn.status === 'completed') {
            const quantity = Math.abs(Number(normalizedTxn.quantity) || 0);
            const isOutbound = normalizedTxn.type === '出库';
            stockChange = isOutbound ? -quantity : quantity;
            totalNetChange += stockChange;
          }
          transactionChanges[normalizedTxn.id] = {
            stockChange,
            normalizedTxn
          };
        }

        // 计算偏移量：使得最新交易后的库存等于产品当前库存
        const offset = productCurrentStock - totalNetChange;

        // 计算每个交易前的库存余额（按时间正序，从最早开始）
        const stockBeforeTransaction = {};
        let cumulativeStock = offset; // 从偏移量（期初库存）开始
        for (const txn of chronologicalTransactions) {
          const normalizedTxn = normalizeTransaction(txn);
          const txnId = normalizedTxn.id;
          stockBeforeTransaction[txnId] = cumulativeStock;
          // 只有 completed 交易才影响累计库存
          if (normalizedTxn.status === 'completed') {
            const quantity = Math.abs(Number(normalizedTxn.quantity) || 0);
            const isOutbound = normalizedTxn.type === '出库';
            const stockChange = isOutbound ? -quantity : quantity;
            cumulativeStock += stockChange;
          }
        }

        // 遍历交易记录（倒序，最新在前），生成台账条目
        for (const txn of sortedTransactions) {
          const normalizedTxn = normalizeTransaction(txn);

          // 确定台账类型
          let ledgerType = '库存调整';
          if (normalizedTxn.type === '入库') {
            ledgerType = '入库';
          } else if (normalizedTxn.type === '出库') {
            ledgerType = '出库';
          } else if (normalizedTxn.type === '调整') {
            ledgerType = '库存调整';
          }

          // 获取交易状态和备注
          const status = normalizedTxn.status || 'completed';
          const notes = normalizedTxn.notes || '';

          // 计算库存变化：只有 completed 交易才影响库存
          let stockChange = 0;
          if (status === 'completed') {
            const quantity = Math.abs(Number(normalizedTxn.quantity) || 0);
            stockChange = normalizedTxn.type === '出库' ? -quantity : quantity;
          }

          // 计算变更前后库存
          let oldStock = stockBeforeTransaction[normalizedTxn.id] || 0;
          let newStock = oldStock + stockChange;
          // 对于 reversed 记录，确保 oldStock = newStock，且 stockChange 为 0
          if (status === 'reversed') {
            // 已撤销的交易不影响库存，前后库存相等
            newStock = oldStock;
            stockChange = 0;
          }

          // 构建台账条目
          ledger.push({
            id: normalizedTxn.id || `txn_${txn.transaction_id || Date.now()}`,
            type: ledgerType,
            timestamp: normalizedTxn.date || normalizedTxn.transaction_date || normalizedTxn.createdAt || new Date().toISOString(),
            stockChange,
            oldStock,
            newStock,
            operator: normalizedTxn.operator || '系统',
            notes: notes, // 使用真实备注，空字符串时前端显示-
            unit: normalizedTxn.unit || '个',
            status: status // 包含交易状态
          });
        }

        console.log(`[dataService] 生成产品 ${productId} 台账，共 ${ledger.length} 条记录`);
        return ledger;
      } catch (error) {
        console.error('[dataService] 获取产品台账失败:', error);
        // API 模式下不降级到 mock，抛出错误让页面展示 error 状态
        throw error;
      }
    }
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
      try {
        const data = await apiRequest('/transactions/');
        // 规范化字段名，确保与前端期望的字段名一致
        return normalizeTransactionList(data);
      } catch (error) {
        console.error('[dataService] 获取交易记录失败:', error);
        // API 模式下不降级到 mock，抛出错误让页面展示 error 状态
        throw error;
      }
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
  },

  /**
   * 撤销交易记录
   * @param {string} transactionId - 交易记录ID
   * @param {string} reversedBy - 撤销操作人
   * @returns {Promise<Object>} 撤销后的记录
   */
  async reverseTransaction(transactionId, reversedBy = '系统') {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      const { reverseTransaction } = await import('./productService.js');
      return reverseTransaction(transactionId, reversedBy);
    } else {
      const data = await apiRequest(`/transactions/${transactionId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reversedBy })
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
      try {
        const data = await apiRequest('/audit-logs/');
        // 规范化字段名，确保与前端期望的字段名一致
        return normalizeAuditLogList(data);
      } catch (error) {
        console.error('[dataService] 获取审计日志失败:', error);
        // API 模式下不降级到 mock，抛出错误让页面展示 error 状态
        throw error;
      }
    }
  }
};

/**
 * 用户相关数据服务
 */
export const userService = {
  /**
   * 获取所有用户
   * @returns {Promise<Array>} 用户列表
   */
  async getAllUsers() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      // 返回模拟用户数据（role 使用英文值，与后端一致）
      return [
        {
          id: 'user-001',
          username: 'admin',
          email: 'admin@example.com',
          role: 'admin',
          status: '活跃',
          lastLogin: '2026-03-29 15:30',
        },
        {
          id: 'user-002',
          username: 'zhang.san',
          email: 'zhang.san@example.com',
          role: 'viewer',
          status: '活跃',
          lastLogin: '2026-03-28 10:20',
        },
        {
          id: 'user-003',
          username: 'li.si',
          email: 'li.si@example.com',
          role: 'viewer',
          status: '活跃',
          lastLogin: '2026-03-27 14:45',
        },
        {
          id: 'user-004',
          username: 'wang.wu',
          email: 'wang.wu@example.com',
          role: 'viewer',
          status: '停用',
          lastLogin: '2026-03-20 09:15',
        },
        {
          id: 'user-005',
          username: 'zhao.liu',
          email: 'zhao.liu@example.com',
          role: 'viewer',
          status: '活跃',
          lastLogin: '2026-03-29 11:10',
        },
      ];
    } else {
      const data = await apiRequest('/users/');
      return normalizeUserList(data);
    }
  },

  /**
   * 新增用户（需管理员权限）
   * @param {Object} payload - { username, password, display_name?, email?, role? }
   *   字段与后端 UserCreate schema 对齐（snake_case）
   *   role 仅允许 "admin" 或 "viewer"，默认 "viewer"
   * @returns {Promise<Object>} 创建的用户对象
   */
  async createUser(payload) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      throw new Error('Mock 模式暂不支持新增用户，请切换到 API 模式');
    }
    const data = await apiRequest('/users/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeUser(data);
  },

  /**
   * 编辑用户信息（需管理员权限）
   * @param {string} userId - 用户 ID（如 user-000001）
   * @param {Object} payload - { username?, display_name?, email?, role? }
   *   role 仅允许 "admin" 或 "viewer"
   * @returns {Promise<Object>} 更新后的用户对象
   */
  async updateUser(userId, payload) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      throw new Error('Mock 模式暂不支持编辑用户，请切换到 API 模式');
    }
    const data = await apiRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return normalizeUser(data);
  },

  /**
   * 启用/停用用户（需管理员权限）
   * @param {string} userId - 用户 ID（如 user-000001）
   * @param {boolean} isActive - true 启用，false 停用
   * @returns {Promise<Object>} 更新后的用户对象
   */
  async updateUserStatus(userId, isActive) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      throw new Error('Mock 模式暂不支持修改用户状态，请切换到 API 模式');
    }
    const data = await apiRequest(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
    return normalizeUser(data);
  },

  /**
   * 管理员重置用户密码（需管理员权限）
   * @param {string} userId - 用户 ID（如 user-000001）
   * @param {string} newPassword - 新密码（至少 6 位）
   * @returns {Promise<Object>} 更新后的用户对象
   */
  async resetUserPassword(userId, newPassword) {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      throw new Error('Mock 模式暂不支持重置密码，请切换到 API 模式');
    }
    const data = await apiRequest(`/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ new_password: newPassword }),
    });
    return normalizeUser(data);
  },
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
      try {
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
      } catch (error) {
        console.error('[dataService] 获取仪表盘统计数据失败:', error);
        // API 模式下不降级到 mock，抛出错误让页面展示 error 状态
        throw error;
      }
    }
  }
};

/**
 * 系统相关数据服务
 */
export const systemService = {
  /**
   * 获取当前数据源模式
   * @returns {string} 当前模式 ('mock' 或 'api')
   */
  getDataSourceMode() {
    return currentMode;
  },

  /**
   * 重置数据（根据当前模式执行不同操作）
   * @returns {Promise<Object>} 重置结果
   */
  async resetData() {
    if (currentMode === DATA_SOURCE_MODE.MOCK) {
      // mock 模式：重置本地存储数据
      const { resetStorageData } = await import('./productService.js');
      return resetStorageData();
    } else {
      // API 模式：不支持重置真实数据
      console.warn('[dataService] API 模式下不支持重置数据操作');
      return {
        success: false,
        message: '当前为 API 模式，数据来自真实后端，不支持重置操作。'
      };
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
  userService,
  dashboardService,
  systemService
};