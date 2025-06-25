import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get user's orders
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const orders = db.prepare(`
      SELECT 
        o.*,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.userId, limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?')
      .get(req.user.userId).count;

    res.json({
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    // Get order details
    const order = db.prepare(`
      SELECT o.*, 
        sa.first_name as shipping_first_name,
        sa.last_name as shipping_last_name,
        sa.address_line_1 as shipping_address_1,
        sa.address_line_2 as shipping_address_2,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.postal_code as shipping_postal_code,
        sa.country as shipping_country,
        ba.first_name as billing_first_name,
        ba.last_name as billing_last_name,
        ba.address_line_1 as billing_address_1,
        ba.address_line_2 as billing_address_2,
        ba.city as billing_city,
        ba.state as billing_state,
        ba.postal_code as billing_postal_code,
        ba.country as billing_country
      FROM orders o
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.id = ? AND o.user_id = ?
    `).get(id, req.user.userId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const items = db.prepare(`
      SELECT 
        oi.*,
        p.name,
        p.sku,
        pi.image_url
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      WHERE oi.order_id = ?
    `).all(id);

    res.json({
      ...order,
      items
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
router.post('/', authenticateToken, (req, res) => {
  try {
    const db = getDatabase();
    const { shippingAddressId, billingAddressId, paymentMethod, notes } = req.body;

    // Get cart items
    const cartItems = db.prepare(`
      SELECT 
        ci.*,
        p.name,
        p.price,
        p.stock_quantity
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = ? AND p.is_active = 1
    `).all(req.user.userId);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Check stock availability
    for (const item of cartItems) {
      if (item.stock_quantity < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${item.name}` 
        });
      }
    }

    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxAmount = subtotal * 0.08; // 8% tax
    const shippingAmount = subtotal > 100 ? 0 : 10; // Free shipping over $100
    const totalAmount = subtotal + taxAmount + shippingAmount;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Start transaction
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        user_id, order_number, status, subtotal, tax_amount, 
        shipping_amount, total_amount, payment_method,
        shipping_address_id, billing_address_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const orderResult = insertOrder.run(
      req.user.userId, orderNumber, 'pending', subtotal, taxAmount,
      shippingAmount, totalAmount, paymentMethod || 'pending',
      shippingAddressId || null, billingAddressId || null, notes || null
    );

    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?
    `);

    for (const item of cartItems) {
      const totalPrice = item.price * item.quantity;
      insertOrderItem.run(orderId, item.product_id, item.quantity, item.price, totalPrice);
      updateStock.run(item.quantity, item.product_id);
    }

    // Clear cart
    const clearCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');
    clearCart.run(req.user.userId);

    res.status(201).json({
      message: 'Order created successfully',
      orderId,
      orderNumber,
      totalAmount
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status (Admin only)
router.put('/:id/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateOrder = db.prepare(`
      UPDATE orders SET 
        status = ?, 
        shipped_at = CASE WHEN ? = 'shipped' THEN CURRENT_TIMESTAMP ELSE shipped_at END,
        delivered_at = CASE WHEN ? = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = updateOrder.run(status, status, status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Get all orders (Admin only)
router.get('/admin/all', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (status) {
      whereClause = 'WHERE o.status = ?';
      params.push(status);
    }

    const orders = db.prepare(`
      SELECT 
        o.*,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const totalQuery = `SELECT COUNT(*) as count FROM orders o ${whereClause}`;
    const total = db.prepare(totalQuery).get(...params).count;

    res.json({
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

export default router;