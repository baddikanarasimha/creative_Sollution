import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Process payment (Mock implementation)
router.post('/process', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { orderId, paymentMethod, paymentDetails } = req.body;

    if (!orderId || !paymentMethod) {
      return res.status(400).json({ error: 'Order ID and payment method are required' });
    }

    // Get order details
    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ? AND user_id = ? AND payment_status = 'pending'
    `).get(orderId, req.user.userId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found or already processed' });
    }

    // Mock payment processing
    const paymentSuccess = Math.random() > 0.1; // 90% success rate for demo

    if (paymentSuccess) {
      // Generate mock payment ID
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Update order with payment information
      const updateOrder = db.prepare(`
        UPDATE orders SET 
          payment_status = 'completed',
          payment_method = ?,
          payment_id = ?,
          status = 'confirmed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateOrder.run(paymentMethod, paymentId, orderId);

      res.json({
        success: true,
        message: 'Payment processed successfully',
        paymentId,
        orderId
      });
    } else {
      // Update order with failed payment
      const updateOrder = db.prepare(`
        UPDATE orders SET 
          payment_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateOrder.run(orderId);

      res.status(400).json({
        success: false,
        error: 'Payment processing failed. Please try again.'
      });
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get payment methods
router.get('/methods', (req, res) => {
  const paymentMethods = [
    {
      id: 'credit_card',
      name: 'Credit Card',
      description: 'Visa, MasterCard, American Express',
      icon: 'credit-card'
    },
    {
      id: 'paypal',
      name: 'PayPal',
      description: 'Pay with your PayPal account',
      icon: 'paypal'
    },
    {
      id: 'apple_pay',
      name: 'Apple Pay',
      description: 'Pay with Touch ID or Face ID',
      icon: 'smartphone'
    },
    {
      id: 'google_pay',
      name: 'Google Pay',
      description: 'Pay with Google Pay',
      icon: 'google'
    }
  ];

  res.json(paymentMethods);
});

export default router;