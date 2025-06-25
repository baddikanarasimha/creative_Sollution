import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user addresses
router.get('/addresses', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    
    const addresses = db.prepare(`
      SELECT * FROM addresses 
      WHERE user_id = ? 
      ORDER BY is_default DESC, created_at DESC
    `).all(req.user.userId);

    res.json(addresses);
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

// Add address
router.post('/addresses', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const {
      type = 'shipping',
      firstName,
      lastName,
      company,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phone,
      isDefault = false
    } = req.body;

    if (!firstName || !lastName || !addressLine1 || !city || !state || !postalCode || !country) {
      return res.status(400).json({ error: 'Required address fields are missing' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      const unsetDefaults = db.prepare(`
        UPDATE addresses SET is_default = 0 WHERE user_id = ? AND type = ?
      `);
      unsetDefaults.run(req.user.userId, type);
    }

    const insertAddress = db.prepare(`
      INSERT INTO addresses (
        user_id, type, first_name, last_name, company,
        address_line_1, address_line_2, city, state, postal_code,
        country, phone, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertAddress.run(
      req.user.userId, type, firstName, lastName, company || null,
      addressLine1, addressLine2 || null, city, state, postalCode,
      country, phone || null, isDefault ? 1 : 0
    );

    res.status(201).json({
      message: 'Address added successfully',
      addressId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

// Update address
router.put('/addresses/:id', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const {
      type,
      firstName,
      lastName,
      company,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phone,
      isDefault
    } = req.body;

    // Check if address belongs to user
    const existingAddress = db.prepare('SELECT id, type FROM addresses WHERE id = ? AND user_id = ?')
      .get(id, req.user.userId);

    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      const unsetDefaults = db.prepare(`
        UPDATE addresses SET is_default = 0 WHERE user_id = ? AND type = ? AND id != ?
      `);
      unsetDefaults.run(req.user.userId, type || existingAddress.type, id);
    }

    const updateAddress = db.prepare(`
      UPDATE addresses SET
        type = ?, first_name = ?, last_name = ?, company = ?,
        address_line_1 = ?, address_line_2 = ?, city = ?, state = ?,
        postal_code = ?, country = ?, phone = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `);

    updateAddress.run(
      type || existingAddress.type, firstName, lastName, company || null,
      addressLine1, addressLine2 || null, city, state, postalCode,
      country, phone || null, isDefault ? 1 : 0, id, req.user.userId
    );

    res.json({ message: 'Address updated successfully' });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

// Delete address
router.delete('/addresses/:id', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const deleteAddress = db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?');
    const result = deleteAddress.run(id, req.user.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// Get wishlist
router.get('/wishlist', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    
    const wishlistItems = db.prepare(`
      SELECT 
        w.*,
        p.name,
        p.price,
        p.compare_price,
        pi.image_url
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      WHERE w.user_id = ? AND p.is_active = 1
      ORDER BY w.created_at DESC
    `).all(req.user.userId);

    res.json(wishlistItems);
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// Add to wishlist
router.post('/wishlist', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Check if product exists
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if already in wishlist
    const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?')
      .get(req.user.userId, productId);

    if (existing) {
      return res.status(400).json({ error: 'Product already in wishlist' });
    }

    const insertWishlist = db.prepare(`
      INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)
    `);

    insertWishlist.run(req.user.userId, productId);

    res.status(201).json({ message: 'Product added to wishlist' });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

// Remove from wishlist
router.delete('/wishlist/:productId', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { productId } = req.params;

    const deleteWishlist = db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?');
    const result = deleteWishlist.run(req.user.userId, productId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found in wishlist' });
    }

    res.json({ message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

export default router;