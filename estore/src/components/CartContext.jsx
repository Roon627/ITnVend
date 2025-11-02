import { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from './ToastContext';

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
    const existingItem = cart.find((item) => item.id === product.id);
    setCart((prevCart) => {
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prevCart, { ...product, quantity }];
    });
    toast.push(
      existingItem ? `Updated ${product.name} in cart` : `Added ${product.name} to cart`,
      existingItem ? 'info' : 'success'
    );
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
    toast.push('Item removed from cart', 'info');
  };

  const updateQuantity = (productId, quantity) => {
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
  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);

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
