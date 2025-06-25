import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, MapPin, Package } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

interface Address {
  id: number;
  type: string;
  first_name: string;
  last_name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string;
  is_default: boolean;
}

interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export default function Checkout() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedShippingAddress, setSelectedShippingAddress] = useState<number | null>(null);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState<number | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { items, total, clearCart } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();

  const subtotal = total;
  const taxAmount = subtotal * 0.08;
  const shippingAmount = subtotal > 100 ? 0 : 10;
  const totalAmount = subtotal + taxAmount + shippingAmount;

  useEffect(() => {
    fetchAddresses();
    fetchPaymentMethods();
  }, []);

  const fetchAddresses = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/users/addresses', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAddresses(data);
        
        // Set default addresses
        const defaultShipping = data.find((addr: Address) => addr.type === 'shipping' && addr.is_default);
        const defaultBilling = data.find((addr: Address) => addr.type === 'billing' && addr.is_default);
        
        if (defaultShipping) setSelectedShippingAddress(defaultShipping.id);
        if (defaultBilling) setSelectedBillingAddress(defaultBilling.id);
      }
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/payments/methods');
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data);
        if (data.length > 0) {
          setSelectedPaymentMethod(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedShippingAddress || (!sameAsShipping && !selectedBillingAddress)) {
      setError('Please select shipping and billing addresses');
      return;
    }

    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create order
      const orderResponse = await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shippingAddressId: selectedShippingAddress,
          billingAddressId: sameAsShipping ? selectedShippingAddress : selectedBillingAddress,
          paymentMethod: selectedPaymentMethod
        })
      });

      if (!orderResponse.ok) {
        const error = await orderResponse.json();
        throw new Error(error.error || 'Failed to create order');
      }

      const orderData = await orderResponse.json();

      // Process payment
      const paymentResponse = await fetch('http://localhost:3001/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: orderData.orderId,
          paymentMethod: selectedPaymentMethod,
          paymentDetails: {} // In a real app, this would contain payment details
        })
      });

      const paymentData = await paymentResponse.json();

      if (paymentData.success) {
        // Clear cart and redirect to success page
        await clearCart();
        navigate(`/orders/${orderData.orderId}`, { 
          state: { orderCreated: true } 
        });
      } else {
        setError(paymentData.error || 'Payment failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    navigate('/cart');
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Checkout Form */}
        <div className="lg:col-span-2 space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Shipping Address */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Shipping Address
            </h2>
            
            {addresses.filter(addr => addr.type === 'shipping').length > 0 ? (
              <div className="space-y-3">
                {addresses.filter(addr => addr.type === 'shipping').map((address) => (
                  <label key={address.id} className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="shippingAddress"
                      value={address.id}
                      checked={selectedShippingAddress === address.id}
                      onChange={(e) => setSelectedShippingAddress(parseInt(e.target.value))}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {address.first_name} {address.last_name}
                      </div>
                      <div className="text-gray-600">
                        {address.address_line_1}
                        {address.address_line_2 && `, ${address.address_line_2}`}
                      </div>
                      <div className="text-gray-600">
                        {address.city}, {address.state} {address.postal_code}
                      </div>
                      <div className="text-gray-600">{address.country}</div>
                      {address.phone && (
                        <div className="text-gray-600">{address.phone}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">No shipping addresses found.</p>
                <button className="text-blue-600 hover:text-blue-800">
                  Add Shipping Address
                </button>
              </div>
            )}
          </div>

          {/* Billing Address */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Billing Address</h2>
            
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={sameAsShipping}
                  onChange={(e) => setSameAsShipping(e.target.checked)}
                  className="mr-2"
                />
                Same as shipping address
              </label>
            </div>

            {!sameAsShipping && (
              <>
                {addresses.filter(addr => addr.type === 'billing').length > 0 ? (
                  <div className="space-y-3">
                    {addresses.filter(addr => addr.type === 'billing').map((address) => (
                      <label key={address.id} className="flex items-start space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="billingAddress"
                          value={address.id}
                          checked={selectedBillingAddress === address.id}
                          onChange={(e) => setSelectedBillingAddress(parseInt(e.target.value))}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-medium">
                            {address.first_name} {address.last_name}
                          </div>
                          <div className="text-gray-600">
                            {address.address_line_1}
                            {address.address_line_2 && `, ${address.address_line_2}`}
                          </div>
                          <div className="text-gray-600">
                            {address.city}, {address.state} {address.postal_code}
                          </div>
                          <div className="text-gray-600">{address.country}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600 mb-4">No billing addresses found.</p>
                    <button className="text-blue-600 hover:text-blue-800">
                      Add Billing Address
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payment Method */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Payment Method
            </h2>
            
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <label key={method.id} className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={selectedPaymentMethod === method.id}
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{method.name}</div>
                    <div className="text-sm text-gray-600">{method.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md sticky top-24">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Order Summary
            </h2>
            
            <div className="space-y-4 mb-6">
              {items.map((item) => (
                <div key={item.id} className="flex items-center space-x-3">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-sm text-gray-600">Qty: {item.quantity}</div>
                  </div>
                  <div className="font-medium">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 mb-6 border-t pt-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">
                  {shippingAmount === 0 ? 'Free' : `$${shippingAmount.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-lg font-semibold">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}