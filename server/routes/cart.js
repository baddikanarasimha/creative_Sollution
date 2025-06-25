import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's cart
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    
    const cartItems = db.prepare(`
      SELECT 
        ci.*,
        p.name,
        p.price,
        p.stock_quantity,
        pi.image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      WHERE ci.user_id = ? AND p.is_active = 1
      ORDER BY ci.created_at DESC
    `).all(req.user.userId);

    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({
      items: cartItems,
      total,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0)
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add item to cart
router.post('/add', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Check if product exists and is active
    const product = db.prepare('SELECT id, stock_quantity FROM products WHERE id = ? AND is_active = 1').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check stock availability
    if (product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Check if item already exists in cart
    const existingItem = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?')
      .get(req.user.userId, productId);

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity;
      if (product.stock_quantity < newQuantity) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }

      const updateItem = db.prepare(`
        UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateItem.run(newQuantity, existingItem.id);
    } else {
      // Add new item
      const insertItem = db.prepare(`
        INSERT INTO cart_items (user_id, product_id, quantity)
        VALUES (?, ?, ?)
      `);
      insertItem.run(req.user.userId, productId, quantity);
    }

    res.json({ message: 'Item added to cart successfully' });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// Update cart item quantity
router.put('/update/:id', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    // Check if cart item belongs to user
    const cartItem = db.prepare(`
      SELECT ci.*, p.stock_quantity
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.id = ? AND ci.user_id = ?
    `).get(id, req.user.userId);

    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Check stock availability
    if (cartItem.stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const updateItem = db.prepare(`
      UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateItem.run(quantity, id);

    res.json({ message: 'Cart item updated successfully' });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// Remove item from cart
router.delete('/remove/:id', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const deleteItem = db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?');
    const result = deleteItem.run(id, req.user.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart successfully' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
router.delete('/clear', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    
    const clearCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');
    clearCart.run(req.user.userId);

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;