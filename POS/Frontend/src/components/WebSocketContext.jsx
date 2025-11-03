/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());

  useEffect(() => {
    // Connect to WebSocket server
    // Use the backend host (same host as current page) but force port 4000.
    // When the app is served via HTTPS, switch to wss so the socket handshake uses TLS.
    const isSecure = window.location.protocol === 'https:';
    const envHost = import.meta.env?.VITE_SOCKET_HOST;
    const envPort = import.meta.env?.VITE_SOCKET_PORT;
    const socketHost = envHost && envHost.trim().length ? envHost : window.location.hostname;
    const socketPort = envPort && envPort.trim().length ? envPort : '4000';
    const socketProtocol = isSecure ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${socketHost}:${socketPort}`;

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      rememberUpgrade: true,
      timeout: 20000,
      secure: isSecure,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    });

    // Listen for all events and update lastMessage
    socket.onAny((event, data) => {
      setLastMessage({ event, data, timestamp: new Date() });

      // Call registered listeners
      const listeners = listenersRef.current.get(event);
      if (listeners) {
        listeners.forEach(callback => callback(data));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = (event, data) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  };

  const joinRoom = (room) => {
    emit('join', room);
  };

  const leaveRoom = (room) => {
    emit('leave', room);
  };

  const on = (event, callback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(callback);

    // Return cleanup function
    return () => {
      const listeners = listenersRef.current.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          listenersRef.current.delete(event);
        }
      }
    };
  };

  const off = (event, callback) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        listenersRef.current.delete(event);
      }
    }
  };

  const value = {
    isConnected,
    lastMessage,
    emit,
    joinRoom,
    leaveRoom,
    on,
    off
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};