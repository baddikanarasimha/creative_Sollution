import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all products with filtering and pagination
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      featured
    } = req.query;

    const offset = (page - 1) * limit;
    
    let whereConditions = ['p.is_active = 1'];
    let params = [];

    if (category) {
      whereConditions.push('p.category_id = ?');
      params.push(category);
    }

    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (minPrice) {
      whereConditions.push('p.price >= ?');
      params.push(minPrice);
    }

    if (maxPrice) {
      whereConditions.push('p.price <= ?');
      params.push(maxPrice);
    }

    if (featured === 'true') {
      whereConditions.push('p.is_featured = 1');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get products
    const query = `
      SELECT 
        p.*,
        c.name as category_name,
        pi.image_url as primary_image,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(r.id) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
      ${whereClause}
      GROUP BY p.id
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const products = db.prepare(query).all(...params, limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;

    const { total } = db.prepare(countQuery).get(...params);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    // Get product details
    const product = db.prepare(`
      SELECT 
        p.*,
        c.name as category_name,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(r.id) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
      WHERE p.id = ? AND p.is_active = 1
      GROUP BY p.id
    `).get(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get product images
    const images = db.prepare(`
      SELECT image_url, alt_text, is_primary
      FROM product_images
      WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC
    `).all(id);

    // Get reviews
    const reviews = db.prepare(`
      SELECT 
        r.*,
        u.first_name,
        u.last_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.is_approved = 1
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(id);

    res.json({
      ...product,
      images,
      reviews
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (Admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const {
      name,
      description,
      price,
      comparePrice,
      sku,
      stockQuantity,
      categoryId,
      brand,
      weight,
      dimensions,
      isFeatured,
      metaTitle,
      metaDescription,
      images
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    // Insert product
    const insertProduct = db.prepare(`
      INSERT INTO products (
        name, description, price, compare_price, sku, stock_quantity,
        category_id, brand, weight, dimensions, is_featured,
        meta_title, meta_description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertProduct.run(
      name, description, price, comparePrice || null, sku || null,
      stockQuantity || 0, categoryId || null, brand || null,
      weight || null, dimensions || null, isFeatured || 0,
      metaTitle || null, metaDescription || null
    );

    const productId = result.lastInsertRowid;

    // Insert images if provided
    if (images && images.length > 0) {
      const insertImage = db.prepare(`
        INSERT INTO product_images (product_id, image_url, alt_text, is_primary)
        VALUES (?, ?, ?, ?)
      `);

      images.forEach((image, index) => {
        insertImage.run(
          productId,
          image.url,
          image.altText || name,
          index === 0 ? 1 : 0
        );
      });
    }

    res.status(201).json({
      message: 'Product created successfully',
      productId
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (Admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const {
      name,
      description,
      price,
      comparePrice,
      sku,
      stockQuantity,
      categoryId,
      brand,
      weight,
      dimensions,
      isFeatured,
      isActive,
      metaTitle,
      metaDescription
    } = req.body;

    const updateProduct = db.prepare(`
      UPDATE products SET
        name = ?, description = ?, price = ?, compare_price = ?,
        sku = ?, stock_quantity = ?, category_id = ?, brand = ?,
        weight = ?, dimensions = ?, is_featured = ?, is_active = ?,
        meta_title = ?, meta_description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = updateProduct.run(
      name, description, price, comparePrice || null, sku || null,
      stockQuantity || 0, categoryId || null, brand || null,
      weight || null, dimensions || null, isFeatured || 0,
      isActive !== undefined ? isActive : 1,
      metaTitle || null, metaDescription || null, id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const deleteProduct = db.prepare('UPDATE products SET is_active = 0 WHERE id = ?');
    const result = deleteProduct.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;