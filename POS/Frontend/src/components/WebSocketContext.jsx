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
  const roomsRef = useRef(new Set());

  useEffect(() => {
    // Connect to WebSocket server
    // Priority: VITE_SOCKET_URL > (VITE_SOCKET_HOST/VITE_SOCKET_PORT) > sane defaults
    const isSecure = window.location.protocol === 'https:';
    const envUrl = import.meta.env?.VITE_SOCKET_URL;
    const envHost = import.meta.env?.VITE_SOCKET_HOST;
    const envPort = import.meta.env?.VITE_SOCKET_PORT;

    let socketUrl;
    if (envUrl && String(envUrl).trim().length) {
      socketUrl = String(envUrl).trim();
    } else {
      if (import.meta.env?.DEV) {
        // In dev, prefer same-origin and let Vite proxy /socket.io to backend.
        socketUrl = undefined; // socket.io-client will use window.location
      } else {
        const host = envHost && envHost.trim().length ? envHost : window.location.hostname;
        const protocol = isSecure ? 'wss:' : 'ws:';
        // For secure origins (production), default to implicit 443 with no explicit port
        // unless an explicit env port is provided.
        const portSegment = envPort && envPort.trim().length
          ? `:${envPort.trim()}`
          : (isSecure ? '' : ':4000');
        socketUrl = `${protocol}//${host}${portSegment}`;
      }
    }

    const socket = io(socketUrl, {
      // Start with polling to handle proxies/load balancers, then upgrade to websocket
      transports: ['polling', 'websocket'],
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      secure: isSecure,
      path: '/socket.io',
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      // Re-join any rooms requested before connection
      try {
        roomsRef.current.forEach((room) => {
          if (room) socket.emit('join', room);
        });
      } catch (e) {
        console.debug('Failed to re-join rooms on connect', e?.message || e);
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error?.message || error);
      if (error?.description) console.debug('Socket error description:', error.description);
      if (error?.context) console.debug('Socket error context:', error.context);
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
    if (!room) return;
    roomsRef.current.add(room);
    if (isConnected) emit('join', room);
  };

  const leaveRoom = (room) => {
    if (!room) return;
    roomsRef.current.delete(room);
    if (isConnected) emit('leave', room);
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