// WebSocket service for real-time broadcasting
export class WebSocketService {
    constructor(io) {
        this.io = io;
    }

    // Broadcast to all connected clients
    broadcast(event, data) {
        this.io.emit(event, data);
    }

    // Send to specific room (e.g., staff notifications, inventory updates)
    to(room) {
        return {
            emit: (event, data) => {
                this.io.to(room).emit(event, data);
            }
        };
    }

    // Send to specific user (if they have a personal room)
    toUser(userId) {
        return this.to(`user_${userId}`);
    }

    // Common event types for POS system
    notifyStockChange(productId, change) {
        this.broadcast('stock_change', { productId, ...change });
    }

    notifyNewOrder(order) {
        this.broadcast('new_order', order);
        this.to('staff').emit('new_order', order);
    }

    notifyPaymentReceived(payment) {
        this.broadcast('payment_received', payment);
    }

    notifyInvoiceCreated(invoice) {
        this.broadcast('invoice_created', invoice);
    }

    notifyCustomerUpdate(customer) {
        this.broadcast('customer_update', customer);
    }

    notifyStaffNotification(staffId, notification) {
        this.toUser(staffId).emit('notification', notification);
        this.to('staff').emit('staff_notification', { staffId, notification });
    }

    notifyLowStockAlert(product) {
        this.to('managers').emit('low_stock_alert', product);
        this.to('staff').emit('low_stock_alert', product);
    }

    notifySystemAlert(message, level = 'info') {
        this.broadcast('system_alert', { message, level, timestamp: new Date() });
    }
}

// Helper function to get WebSocket service instance
export function getWebSocketService() {
    if (!global.io) {
        throw new Error('WebSocket server not initialized');
    }
    return new WebSocketService(global.io);
}