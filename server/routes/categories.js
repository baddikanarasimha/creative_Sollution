import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all categories
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    
    const categories = db.prepare(`
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all();

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get single category
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const category = db.prepare(`
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE c.id = ? AND c.is_active = 1
      GROUP BY c.id
    `).get(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create category (Admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { name, description, imageUrl, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const insertCategory = db.prepare(`
      INSERT INTO categories (name, description, image_url, parent_id)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertCategory.run(name, description || null, imageUrl || null, parentId || null);

    res.status(201).json({
      message: 'Category created successfully',
      categoryId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category (Admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { name, description, imageUrl, parentId, isActive } = req.body;

    const updateCategory = db.prepare(`
      UPDATE categories SET
        name = ?, description = ?, image_url = ?, parent_id = ?, is_active = ?
      WHERE id = ?
    `);

    const result = updateCategory.run(
      name, description || null, imageUrl || null, parentId || null,
      isActive !== undefined ? isActive : 1, id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const deleteCategory = db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?');
    const result = deleteCategory.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;