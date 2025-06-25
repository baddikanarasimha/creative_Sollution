import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'ecommerce.db');
let db;

export function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initializeDatabase() {
  const database = getDatabase();
  
  // Create tables
  const createTables = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'customer',
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      image_url TEXT,
      parent_id INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      compare_price DECIMAL(10,2),
      sku TEXT UNIQUE,
      stock_quantity INTEGER DEFAULT 0,
      category_id INTEGER,
      brand TEXT,
      weight DECIMAL(8,2),
      dimensions TEXT,
      is_active BOOLEAN DEFAULT 1,
      is_featured BOOLEAN DEFAULT 0,
      meta_title TEXT,
      meta_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- Product images table
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      is_primary BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Addresses table
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'shipping',
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company TEXT,
      address_line_1 TEXT NOT NULL,
      address_line_2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL,
      phone TEXT,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Shopping cart table
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(user_id, product_id)
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      subtotal DECIMAL(10,2) NOT NULL,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      shipping_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT,
      payment_id TEXT,
      shipping_address_id INTEGER,
      billing_address_id INTEGER,
      notes TEXT,
      shipped_at DATETIME,
      delivered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (shipping_address_id) REFERENCES addresses(id),
      FOREIGN KEY (billing_address_id) REFERENCES addresses(id)
    );

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Coupons table
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'percentage' or 'fixed'
      value DECIMAL(10,2) NOT NULL,
      minimum_amount DECIMAL(10,2),
      maximum_discount DECIMAL(10,2),
      usage_limit INTEGER,
      used_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      starts_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Reviews table
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      title TEXT,
      comment TEXT,
      is_verified BOOLEAN DEFAULT 0,
      is_approved BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(product_id, user_id)
    );

    -- Wishlist table
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(user_id, product_id)
    );
  `;

  // Execute table creation
  database.exec(createTables);

  // Create indexes for better performance
  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);
    CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
  `;

  database.exec(createIndexes);

  // Insert sample data
  insertSampleData(database);

  console.log('✅ Database initialized successfully');
}

function insertSampleData(database) {
  // Check if data already exists
  const userCount = database.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    return; // Data already exists
  }

  console.log('📦 Inserting sample data...');

  // Insert categories
  const insertCategory = database.prepare(`
    INSERT INTO categories (name, description, image_url) VALUES (?, ?, ?)
  `);

  const categories = [
    ['Electronics', 'Latest electronic devices and gadgets', 'https://images.pexels.com/photos/356056/pexels-photo-356056.jpeg'],
    ['Clothing', 'Fashion and apparel for all occasions', 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg'],
    ['Home & Garden', 'Everything for your home and garden', 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg'],
    ['Sports & Outdoors', 'Sports equipment and outdoor gear', 'https://images.pexels.com/photos/863988/pexels-photo-863988.jpeg'],
    ['Books', 'Books and educational materials', 'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg']
  ];

  categories.forEach(category => {
    insertCategory.run(...category);
  });

  // Insert products
  const insertProduct = database.prepare(`
    INSERT INTO products (name, description, price, compare_price, sku, stock_quantity, category_id, brand, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const products = [
    ['iPhone 15 Pro', 'Latest iPhone with advanced camera system', 999.99, 1099.99, 'IP15P-128', 50, 1, 'Apple', 1],
    ['Samsung Galaxy S24', 'Flagship Android smartphone', 899.99, 999.99, 'SGS24-256', 30, 1, 'Samsung', 1],
    ['MacBook Air M3', 'Lightweight laptop with M3 chip', 1299.99, 1399.99, 'MBA-M3-256', 25, 1, 'Apple', 1],
    ['Sony WH-1000XM5', 'Premium noise-canceling headphones', 399.99, 449.99, 'SONY-WH1000XM5', 40, 1, 'Sony', 0],
    ['Nike Air Max 270', 'Comfortable running shoes', 149.99, 179.99, 'NIKE-AM270-10', 100, 2, 'Nike', 1],
    ['Levi\'s 501 Jeans', 'Classic straight-leg jeans', 79.99, 89.99, 'LEVIS-501-32', 75, 2, 'Levi\'s', 0],
    ['Adidas Ultraboost 22', 'High-performance running shoes', 189.99, 219.99, 'ADIDAS-UB22-9', 60, 2, 'Adidas', 0],
    ['KitchenAid Stand Mixer', 'Professional stand mixer', 379.99, 429.99, 'KA-SM-RED', 20, 3, 'KitchenAid', 1],
    ['Dyson V15 Detect', 'Cordless vacuum cleaner', 749.99, 799.99, 'DYSON-V15', 15, 3, 'Dyson', 0],
    ['Instant Pot Duo 7-in-1', 'Multi-use pressure cooker', 99.99, 129.99, 'IP-DUO-6QT', 35, 3, 'Instant Pot', 0]
  ];

  products.forEach(product => {
    insertProduct.run(...product);
  });

  // Insert product images
  const insertImage = database.prepare(`
    INSERT INTO product_images (product_id, image_url, alt_text, is_primary) VALUES (?, ?, ?, ?)
  `);

  const productImages = [
    [1, 'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg', 'iPhone 15 Pro', 1],
    [2, 'https://images.pexels.com/photos/404280/pexels-photo-404280.jpeg', 'Samsung Galaxy S24', 1],
    [3, 'https://images.pexels.com/photos/205421/pexels-photo-205421.jpeg', 'MacBook Air M3', 1],
    [4, 'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg', 'Sony Headphones', 1],
    [5, 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg', 'Nike Air Max 270', 1],
    [6, 'https://images.pexels.com/photos/1598507/pexels-photo-1598507.jpeg', 'Levi\'s Jeans', 1],
    [7, 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg', 'Adidas Ultraboost', 1],
    [8, 'https://images.pexels.com/photos/4226796/pexels-photo-4226796.jpeg', 'KitchenAid Mixer', 1],
    [9, 'https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg', 'Dyson Vacuum', 1],
    [10, 'https://images.pexels.com/photos/4226796/pexels-photo-4226796.jpeg', 'Instant Pot', 1]
  ];

  productImages.forEach(image => {
    insertImage.run(...image);
  });

  console.log('✅ Sample data inserted successfully');
}