import redis from 'redis';

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
  // Redis connection configuration: allow either REDIS_URL or REDIS_HOST/REDIS_PORT
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || '6379';
  const redisUrl = process.env.REDIS_URL || `redis://${redisHost}:${redisPort}`;

      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 60000,
          lazyConnect: true,
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('Redis max retry attempts reached');
            return new Error('Max retry attempts reached');
          }
          // Exponential backoff
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        console.warn('Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('Redis connection ended');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();

    } catch (error) {
      console.warn('Failed to initialize Redis cache:', error.message);
      console.log('Continuing without Redis caching...');
      this.client = null;
    }
  }

  // Generic cache methods
  async get(key) {
    if (!this.client || !this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('Redis GET error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) { // Default 5 minutes TTL
    if (!this.client || !this.isConnected) return false;

    try {
      const serializedValue = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      console.warn('Redis SET error:', error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.client || !this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.warn('Redis DEL error:', error.message);
      return false;
    }
  }

  async exists(key) {
    if (!this.client || !this.isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.warn('Redis EXISTS error:', error.message);
      return false;
    }
  }

  // Cache key generators
  static key = {
    products: () => 'products:list',
    product: (id) => `product:${id}`,
    customers: () => 'customers:list',
    customer: (id) => `customer:${id}`,
    categories: () => 'products:categories',
    settings: () => 'settings',
    invoices: (page = 1, limit = 50) => `invoices:page${page}:limit${limit}`,
    invoice: (id) => `invoice:${id}`,
    stockAdjustments: (page = 1, limit = 50) => `stock_adjustments:page${page}:limit${limit}`,
  };

  // Application-specific cache methods
  async getProducts() {
    return this.get(CacheService.key.products());
  }

  async setProducts(products, ttl = 300) {
    return this.set(CacheService.key.products(), products, ttl);
  }

  async invalidateProducts() {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const patternKeys = await this.client.keys('products:*');
      if (patternKeys.length) {
        await this.client.del(patternKeys);
      }
      // ensure legacy key is cleared as well
      await this.client.del(CacheService.key.products());
      return true;
    } catch (error) {
      console.warn('Redis invalidate products error:', error.message);
      return false;
    }
  }

  async getProduct(id) {
    return this.get(CacheService.key.product(id));
  }

  async setProduct(product, ttl = 300) {
    return this.set(CacheService.key.product(product.id), product, ttl);
  }

  async invalidateProduct(id) {
    return this.del(CacheService.key.product(id));
  }

  async getCustomers() {
    return this.get(CacheService.key.customers());
  }

  async setCustomers(customers, ttl = 300) {
    return this.set(CacheService.key.customers(), customers, ttl);
  }

  async invalidateCustomers() {
    return this.del(CacheService.key.customers());
  }

  async getCustomer(id) {
    return this.get(CacheService.key.customer(id));
  }

  async setCustomer(customer, ttl = 300) {
    return this.set(CacheService.key.customer(customer.id), customer, ttl);
  }

  async invalidateCustomer(id) {
    return this.del(CacheService.key.customer(id));
  }

  async getCategories() {
    return this.get(CacheService.key.categories());
  }

  async setCategories(categories, ttl = 600) { // Categories change less frequently
    return this.set(CacheService.key.categories(), categories, ttl);
  }

  async invalidateCategories() {
    return this.del(CacheService.key.categories());
  }

  async getSettings() {
    return this.get(CacheService.key.settings());
  }

  async setSettings(settings, ttl = 600) { // Settings change infrequently
    return this.set(CacheService.key.settings(), settings, ttl);
  }

  async invalidateSettings() {
    return this.del(CacheService.key.settings());
  }

  // Batch invalidation methods
  async invalidateAllProducts() {
    // Get all product keys and delete them
    if (!this.client || !this.isConnected) return;

    try {
      const keys = await this.client.keys('product:*');
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      await this.invalidateProducts();
    } catch (error) {
      console.warn('Error invalidating all products:', error.message);
    }
  }

  async invalidateAllCustomers() {
    if (!this.client || !this.isConnected) return;

    try {
      const keys = await this.client.keys('customer:*');
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      await this.invalidateCustomers();
    } catch (error) {
      console.warn('Error invalidating all customers:', error.message);
    }
  }

  // Health check
  async ping() {
    if (!this.client || !this.isConnected) return false;

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  // Graceful shutdown
  async close() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;
