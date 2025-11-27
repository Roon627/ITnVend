/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from './ToastContext';
import { withPreorderFlags } from '../lib/preorder';
import { getSaleInfo } from '../lib/sale';

const noop = () => {};
const defaultValue = {
  cart: [],
  addToCart: noop,
  removeFromCart: noop,
  updateQuantity: noop,
  clearCart: noop,
  cartCount: 0,
  cartTotal: 0,
};

const CartContext = createContext(defaultValue);

export function useCart() {
  return useContext(CartContext) ?? defaultValue;
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const toast = useToast();

  const normalizeStock = (item) => {
    if (!item) return null;
    if (item.track_inventory === 0 || item.track_inventory === false) return null;
    const raw = item.stock ?? item.quantity ?? item.qty ?? null;
    if (raw == null) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    const coerced = parseInt(raw, 10);
    return Number.isFinite(coerced) ? coerced : null;
  };

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch (error) {
      console.error("Failed to parse cart from localStorage", error);
      localStorage.removeItem('cart');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product, quantity = 1) => {
    const normalized = withPreorderFlags(product);
    const sale = getSaleInfo(normalized);
    const existingItem = cart.find((item) => item.id === normalized.id);
    const stockLimit = normalizeStock(normalized);
    const trackLimited = stockLimit !== null && !normalized.preorder && !normalized.availableForPreorder;
    let requestedQty = Number(quantity) || 1;
    if (trackLimited) {
      const currentQty = existingItem ? existingItem.quantity : 0;
      const remaining = stockLimit - currentQty;
      if (remaining <= 0) {
        if (stockLimit === 0) {
          toast.push(`${normalized.name} is sold out.`, 'warning');
        } else {
          toast.push(`Only ${stockLimit} in stock for ${normalized.name}`, 'warning');
        }
        return;
      }
      if (requestedQty > remaining) {
        requestedQty = remaining;
        toast.push(`Limited to ${remaining} more for ${normalized.name}`, 'info');
      }
    }
    if (requestedQty <= 0) return;
    setCart((prevCart) => {
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === normalized.id
            ? {
                ...item,
                quantity: item.quantity + requestedQty,
                preorder: item.preorder || normalized.preorder,
                availableForPreorder: item.availableForPreorder || normalized.availableForPreorder,
                preorder_enabled: normalized.preorder_enabled ?? item.preorder_enabled,
                stock: stockLimit ?? item.stock ?? null,
                track_inventory: normalized.track_inventory ?? item.track_inventory,
                is_on_sale: sale.isOnSale ? 1 : 0,
                sale_price: sale.salePrice ?? item.sale_price,
                discount_percent: sale.discountPercent ?? item.discount_percent,
                effectivePrice: sale.effectivePrice ?? item.effectivePrice ?? item.price,
              }
            : item
        );
      }
        return [
          ...prevCart,
          {
            ...normalized,
            quantity: requestedQty,
            stock: stockLimit,
            track_inventory: normalized.track_inventory,
            is_on_sale: sale.isOnSale ? 1 : 0,
            sale_price: sale.salePrice,
            discount_percent: sale.discountPercent,
            effectivePrice: sale.effectivePrice,
          },
        ];
    });
    toast.push(
      existingItem ? `Updated ${normalized.name} in cart` : `Added ${normalized.name} to cart`,
      existingItem ? 'info' : 'success'
    );
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
    toast.push('Item removed from cart', 'info');
  };

  const updateQuantity = (productId, quantity) => {
    const target = cart.find((item) => item.id === productId);
    if (!target) return;
    const desired = Number(quantity) || 0;
    const stockLimit = normalizeStock(target);
    const trackLimited = stockLimit !== null && !target.preorder && !target.availableForPreorder;
    if (trackLimited && desired > stockLimit) {
      toast.push(`Only ${stockLimit} available for ${target.name}`, 'warning');
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.id === productId ? { ...item, quantity: stockLimit } : item
        )
      );
      return;
    }
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(prevCart =>
        prevCart.map(item =>
          item.id === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  const clearCart = () => {
    setCart([]);
    toast.push('Cart cleared', 'info');
  };

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + (item.effectivePrice ?? item.price ?? 0) * item.quantity, 0);

  const value = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartCount,
    cartTotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
