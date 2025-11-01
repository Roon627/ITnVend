import { useEffect, useState } from 'react';
import { useWebSocket } from '../components/WebSocketContext';

/**
 * Hook for listening to real-time WebSocket events
 * @param {string} event - The event name to listen for
 * @param {function} callback - Callback function to handle the event
 * @param {Array} deps - Dependencies for the effect
 */
export const useWebSocketEvent = (event, callback, deps = []) => {
  const { on, off } = useWebSocket();

  useEffect(() => {
    const cleanup = on(event, callback);
    return cleanup;
  }, [event, ...deps]);
};

/**
 * Hook for real-time stock updates
 * @param {function} callback - Callback function that receives stock change data
 */
export const useStockUpdates = (callback) => {
  useWebSocketEvent('stock_change', callback);
};

/**
 * Hook for real-time order updates
 * @param {function} callback - Callback function that receives new order data
 */
export const useOrderUpdates = (callback) => {
  useWebSocketEvent('new_order', callback);
};

/**
 * Hook for real-time payment updates
 * @param {function} callback - Callback function that receives payment data
 */
export const usePaymentUpdates = (callback) => {
  useWebSocketEvent('payment_received', callback);
};

/**
 * Hook for real-time invoice updates
 * @param {function} callback - Callback function that receives invoice data
 */
export const useInvoiceUpdates = (callback) => {
  useWebSocketEvent('invoice_created', callback);
};

/**
 * Hook for real-time customer updates
 * @param {function} callback - Callback function that receives customer update data
 */
export const useCustomerUpdates = (callback) => {
  useWebSocketEvent('customer_update', callback);
};

/**
 * Hook for real-time notifications
 * @param {function} callback - Callback function that receives notification data
 */
export const useNotificationUpdates = (callback) => {
  useWebSocketEvent('notification', callback);
};

/**
 * Hook for low stock alerts
 * @param {function} callback - Callback function that receives low stock alert data
 */
export const useLowStockAlerts = (callback) => {
  useWebSocketEvent('low_stock_alert', callback);
};

/**
 * Hook for system alerts
 * @param {function} callback - Callback function that receives system alert data
 */
export const useSystemAlerts = (callback) => {
  useWebSocketEvent('system_alert', callback);
};

/**
 * Hook for joining/leaving WebSocket rooms
 * @param {string} room - Room name to join
 * @param {boolean} shouldJoin - Whether to join or leave the room
 */
export const useWebSocketRoom = (room, shouldJoin = true) => {
  const { joinRoom, leaveRoom } = useWebSocket();

  useEffect(() => {
    if (shouldJoin && room) {
      joinRoom(room);
      return () => leaveRoom(room);
    }
  }, [room, shouldJoin]);
};