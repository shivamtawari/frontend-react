/**
 * WebSocket Service
 * 
 * Core WebSocket connection manager with:
 * - Automatic reconnection with exponential backoff
 * - Message queue for offline support
 * - Event emitter pattern for message handling
 * - Connection state tracking
 * - Promise-based message sending with response correlation
 */

import { isValidMessage, isErrorMessage, extractError } from '../utils/messageTypes';

/**
 * Connection states
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  maxReconnectDelay: 10000,
  messageTimeout: 900000, // 15 minutes for long inference tasks
};

/**
 * WebSocket Service Class
 * Manages WebSocket connections with automatic reconnection and message handling
 */
class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.config = { ...DEFAULT_CONFIG };

    // Reconnection tracking
    this.reconnectCount = 0;
    this.reconnectTimeout = null;

    // Event listeners
    this.listeners = new Map(); // type -> Set of callbacks
    this.globalListeners = new Set(); // Listeners for all messages

    // Message tracking for request/response correlation
    this.pendingMessages = new Map(); // messageId -> {resolve, reject, timeout}

    // Message queue for offline messages
    this.messageQueue = [];
    this.queueEnabled = false;
  }

  /**
   * Initialize and connect to WebSocket
   * @param {string} url - WebSocket URL
   * @param {Object} config - Configuration options
   * @returns {Promise<void>}
   */
  connect(url, config = {}) {
    this.url = url;
    this.config = { ...this.config, ...config };

    return new Promise((resolve, reject) => {
      this._updateConnectionState(ConnectionState.CONNECTING);

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this._handleOpen();
          this.reconnectCount = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          this._updateConnectionState(ConnectionState.ERROR);
        };

        this.ws.onclose = (event) => {
          this._handleClose(event);
        };

        // Connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.connectionState === ConnectionState.CONNECTING) {
            reject(new Error('Connection timeout'));
            this.disconnect();
          }
        }, 10000);

        this.ws.addEventListener('open', () => clearTimeout(connectionTimeout), { once: true });

      } catch (error) {
        console.error('[WebSocket] Connection failed:', error);
        this._updateConnectionState(ConnectionState.ERROR);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close();
      this.ws = null;
    }

    // Reject all pending messages
    this.pendingMessages.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket disconnected'));
    });
    this.pendingMessages.clear();

    this._updateConnectionState(ConnectionState.DISCONNECTED);
  }

  /**
   * Send a message through WebSocket
   * @param {Object} message - Message to send
   * @param {boolean} expectResponse - Whether to wait for a response
   * @returns {Promise<Object|void>} Response message if expectResponse is true
   */
  send(message, expectResponse = false) {
    // Queue message if not connected
    if (this.connectionState !== ConnectionState.CONNECTED) {
      if (this.queueEnabled) {
        this.messageQueue.push({ message, expectResponse });
        return Promise.resolve();
      } else {
        return Promise.reject(new Error('WebSocket not connected'));
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const messageStr = JSON.stringify(message);
        this.ws.send(messageStr);

        if (expectResponse) {
          // Set up timeout for response
          const timeout = setTimeout(() => {
            this.pendingMessages.delete(message.id);
            reject(new Error(`Message timeout: ${message.type}`));
          }, this.config.messageTimeout);

          // Store promise handlers
          this.pendingMessages.set(message.id, { resolve, reject, timeout });
        } else {
          resolve();
        }
      } catch (error) {
        console.error('[WebSocket] Send failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to messages of a specific type
   * @param {string} type - Message type to listen for
   * @param {Function} callback - Callback function (message) => void
   * @returns {Function} Unsubscribe function
   */
  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(type);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  /**
   * Subscribe to all messages
   * @param {Function} callback - Callback function (message) => void
   * @returns {Function} Unsubscribe function
   */
  onAny(callback) {
    this.globalListeners.add(callback);

    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * Subscribe to connection state changes
   * @param {Function} callback - Callback function (state) => void
   * @returns {Function} Unsubscribe function
   */
  onConnectionStateChange(callback) {
    return this.on('__connection_state_change__', callback);
  }

  /**
   * Get current connection state
   * @returns {string} Current connection state
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * Check if connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Enable message queueing when offline
   * @param {boolean} enabled - Whether to enable queueing
   */
  setQueueEnabled(enabled) {
    this.queueEnabled = enabled;
  }

  /**
   * Get number of queued messages
   * @returns {number} Queue length
   */
  getQueueLength() {
    return this.messageQueue.length;
  }

  /**
   * Clear message queue
   */
  clearQueue() {
    this.messageQueue = [];
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Handle WebSocket open event
   * @private
   */
  _handleOpen() {
    this._updateConnectionState(ConnectionState.CONNECTED);

    // Flush queued messages
    if (this.messageQueue.length > 0) {
      const queue = [...this.messageQueue];
      this.messageQueue = [];

      queue.forEach(({ message, expectResponse }) => {
        this.send(message, expectResponse).catch(err => {
          console.error('[WebSocket] Failed to send queued message:', err);
        });
      });
    }
  }

  /**
   * Handle incoming WebSocket message
   * @private
   */
  _handleMessage(event) {
    try {
      // Check if event.data is already an object or needs parsing
      let message;
      if (typeof event.data === 'string') {
        try {
          message = JSON.parse(event.data);
          
          // Check if we got a character-indexed object (not a valid parsed object)
          const keys = Object.keys(message || {});
          const hasNumericKeys = keys.length > 50 && keys.every(k => !isNaN(k));
          
          if (hasNumericKeys || (!message?.type && keys.length > 100)) {
            // Convert character-indexed object back to string and re-parse
            const reconstructed = Object.values(message).join('');
            message = JSON.parse(reconstructed);
          }
        } catch (error) {
          console.error('[WebSocket] JSON parse error:', error);
          return;
        }
      } else if (typeof event.data === 'object') {
        message = event.data;
      } else {
        console.error('[WebSocket] Unexpected event.data type:', typeof event.data);
        return;
      }

      if (!isValidMessage(message)) {
        console.warn('[WebSocket] Invalid message format:', message);
        // Temporarily allow invalid messages to proceed
        // return;
      }

      // Check if this is a response to a pending message
      if (this.pendingMessages.has(message.id)) {
        const { resolve, reject, timeout } = this.pendingMessages.get(message.id);
        clearTimeout(timeout);
        this.pendingMessages.delete(message.id);

        if (isErrorMessage(message)) {
          reject(extractError(message));
        } else {
          resolve(message);
        }
      }

      // Notify type-specific listeners
      const typeListeners = this.listeners.get(message.type);
      
      if (typeListeners) {
        typeListeners.forEach(callback => {
          try {
            callback(message);
          } catch (error) {
            console.error('[WebSocket] Listener error:', error);
          }
        });
      }

      // Notify global listeners
      this.globalListeners.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error('[WebSocket] Global listener error:', error);
        }
      });

    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Handle WebSocket close event
   * @private
   */
  _handleClose(event) {
    // Don't reconnect if closed normally
    if (event.code === 1000) {
      this._updateConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    // Attempt reconnection
    if (this.reconnectCount < this.config.reconnectAttempts) {
      this._reconnect();
    } else {
      console.error('[WebSocket] Max reconnection attempts reached');
      this._updateConnectionState(ConnectionState.ERROR);
    }
  }

  /**
   * Attempt to reconnect
   * @private
   */
  _reconnect() {
    if (!this.url) return;

    this.reconnectCount++;
    this._updateConnectionState(ConnectionState.RECONNECTING);

    // Exponential backoff
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectCount - 1),
      this.config.maxReconnectDelay
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.url, this.config).catch(error => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Update connection state and notify listeners
   * @private
   */
  _updateConnectionState(newState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;

      // Notify connection state listeners
      const listeners = this.listeners.get('__connection_state_change__');
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(newState);
          } catch (error) {
            console.error('[WebSocket] Connection state listener error:', error);
          }
        });
      }
    }
  }
}

// Singleton instance
const websocketService = new WebSocketService();

export default websocketService;