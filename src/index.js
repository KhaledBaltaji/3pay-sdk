/**
 * 3PA-Y Client SDK
 * Easy integration for crypto payments
 */

class ThreePay {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || 'http://localhost:5000';
  }

  /**
   * Make authenticated API request (3PA-Y Format)
   * Uses apiKey and x-api-secret headers
   */
  async request(method, path, data = null) {
    const headers = {
      'Content-Type': 'application/json',
      'apiKey': this.apiKey,
      'x-api-secret': this.apiSecret
    };

    const url = `${this.baseUrl}${path}`;

    try {
      let response;

      if (typeof window !== 'undefined' && window.fetch) {
        // Browser environment
        const options = {
          method,
          headers,
          ...(data && { body: JSON.stringify(data) })
        };
        response = await fetch(url, options);

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch (e) {
            errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
          }
          throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }

        return await response.json();
      } else {
        // Node.js environment
        let axios;
        try {
          axios = require('axios');
        } catch (e) {
          throw new Error('axios is required for Node.js environment. Install with: npm install axios');
        }
        const config = {
          method,
          url,
          headers,
          ...(data && { data })
        };
        response = await axios(config);
        return response.data;
      }
    } catch (error) {
      if (error.response) {
        // Axios error with response
        const errorData = error.response.data;
        throw new Error(errorData.message || errorData.error || `API request failed: ${error.message}`);
      }
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  /**
   * Create a transaction/payment
   * @param {Object} paymentData - Payment details
   * @param {number} paymentData.amount - Amount to charge
   * @param {string} paymentData.currencyType - Currency type (e.g., 'USDT-TRC20', 'USDT-ERC20')
   * @param {string} paymentData.callbackUrl - Webhook callback URL
   * @param {boolean} paymentData.openCheckout - If true, automatically opens the checkout URL in a new window (browser only)
   * @param {Object} paymentData.checkoutOptions - Options for the checkout window (width, height, openInSameTab, openInNewTab, etc.)
   * @param {boolean} paymentData.checkoutOptions.openInSameTab - If true, opens checkout in the same tab instead of a popup
   * @param {boolean} paymentData.checkoutOptions.openInNewTab - If true, opens checkout in a new tab instead of a popup
   * @returns {Promise} Transaction response
   */
  async createTransaction(paymentData) {
    const {
      amount,
      currencyType = 'USDT-TRC20',
      callbackUrl,
      openCheckout = false,
      checkoutOptions = {}
    } = paymentData;

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!callbackUrl) {
      throw new Error('Callback URL is required');
    }

    const params = new URLSearchParams({
      amount: amount.toString(),
      currencyType,
      callbackUrl
    });

    const response = await this.request('POST', `/api/v1/transaction/create?${params}`);

    // If openCheckout is true and we have a URL, open it (browser only)
    if (openCheckout && response.url && typeof window !== 'undefined') {
      const {
        width = 500,
        height = 700,
        windowFeatures = null,
        openInSameTab = false,
        openInNewTab = false
      } = checkoutOptions;

      const checkoutUrl = response.url;
      console.log('Opening checkout with URL:', checkoutUrl);

      if (openInSameTab) {
        // Open in the same tab
        window.location.href = checkoutUrl;
        response.checkoutWindow = window; // Reference to current window
      } else if (openInNewTab) {
        // Open in a new tab
        const newTab = window.open(checkoutUrl, '_blank');
        if (!newTab) {
          console.warn('Failed to open checkout in new tab. Please allow popups for this site.');
        } else {
          response.checkoutWindow = newTab;
        }
      } else {
        // Open in a popup window (default behavior)
        // Calculate centered position
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        // Default window features
        const features = windowFeatures || `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

        const checkoutWindow = window.open(checkoutUrl, '3PA-Y Checkout', features);

        if (!checkoutWindow) {
          console.warn('Failed to open checkout window. Please allow popups for this site.');
        } else {
          // Attach the window reference to the response
          response.checkoutWindow = checkoutWindow;
        }
      }
    }

    return response;
  }

  /**
   * Create a payment (alias for createTransaction)
   */
  async createPayment(paymentData) {
    return this.createTransaction(paymentData);
  }

  /**
   * Get transaction details
   * @param {string} transactionId - Transaction ID
   * @returns {Promise} Transaction details
   */
  async getTransaction(transactionId) {
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    const params = new URLSearchParams({ transactionId });
    const response = await this.request('GET', `/api/v1/transaction/get?${params}`);
    return response;
  }

  /**
   * Verify a payment (alias for getTransaction)
   */
  async verifyPayment(transactionId) {
    return this.getTransaction(transactionId);
  }

  /**
   * Create withdrawal request
   * @param {Object} withdrawData - Withdrawal details
   * @param {string} withdrawData.walletAddress - Destination wallet address
   * @param {string} withdrawData.amount - Amount to withdraw
   * @param {string} withdrawData.currencyType - Currency type (e.g., 'USDT-TRC20', 'USDT-ERC20')
   * @param {string} withdrawData.callbackUrl - Webhook callback URL
   * @returns {Promise} Withdrawal response
   */
  async withdraw(withdrawData) {
    const {
      walletAddress,
      amount,
      currencyType = 'USDT-TRC20',
      callbackUrl
    } = withdrawData;

    if (!walletAddress || !amount || !callbackUrl) {
      throw new Error('Wallet address, amount, and callback URL are required');
    }

    const response = await this.request('POST', '/api/v1/withdrawal-request', {
      walletAddress,
      amount: amount.toString(),
      type: 'Withdrawal Request',
      callbackUrl,
      currencyType
    });

    return response;
  }

  /**
   * Open checkout popup, same tab, or new tab
   * @param {string} transactionId - Transaction ID
   * @param {Object} options - Checkout options
   * @param {number} options.width - Popup width (default: 500)
   * @param {number} options.height - Popup height (default: 700)
   * @param {boolean} options.openInSameTab - If true, opens in same tab instead of popup
   * @param {boolean} options.openInNewTab - If true, opens in new tab instead of popup
   * @param {Function} options.onSuccess - Success callback
   * @param {Function} options.onCancel - Cancel callback
   * @param {Function} options.onError - Error callback
   */
  openCheckout(transactionId, options = {}) {
    if (typeof window === 'undefined') {
      throw new Error('openCheckout is only available in browser environment');
    }

    const {
      width = 500,
      height = 700,
      openInSameTab = false,
      openInNewTab = false,
      onSuccess,
      onCancel,
      onError
    } = options;

    const checkoutUrl = `${this.baseUrl}/checkout/${transactionId}`;

    if (openInSameTab) {
      // Open in the same tab
      window.location.href = checkoutUrl;
      return window; // Return reference to current window
    } else if (openInNewTab) {
      // Open in a new tab
      const newTab = window.open(checkoutUrl, '_blank');
      if (!newTab) {
        if (onError) onError(new Error('Failed to open checkout in new tab. Please allow popups for this site.'));
        return null;
      }
      return newTab;
    } else {
      // Open in popup window (default behavior)
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        checkoutUrl,
        '3PA-Y Checkout',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        if (onError) onError(new Error('Failed to open popup. Please allow popups for this site.'));
        return null;
      }

      // Poll for popup close
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);

          // Check payment status
          this.verifyPayment(transactionId)
            .then(result => {
              if (result.success && result.data.status === 'completed') {
                onSuccess && onSuccess(result.data);
              } else {
                onCancel && onCancel();
              }
            })
            .catch(error => {
              onError && onError(error);
            });
        }
      }, 1000);

      return popup;
    }
  }

  /**
   * Create and open a standalone checkout page without requiring a server
   * @param {Object} paymentData - Payment details
   * @param {Object} options - Checkout options
   * @param {number} options.width - Popup width (default: 500)
   * @param {number} options.height - Popup height (default: 700)
   * @param {boolean} options.openInSameTab - If true, opens in same tab instead of popup
   * @param {boolean} options.openInNewTab - If true, opens in new tab instead of popup
   * @param {Function} options.onSuccess - Success callback
   * @param {Function} options.onCancel - Cancel callback
   * @param {Function} options.onError - Error callback
   */
  async openStandaloneCheckout(paymentData, options = {}) {
    if (typeof window === 'undefined') {
      throw new Error('openStandaloneCheckout is only available in browser environment');
    }

    const {
      width = 500,
      height = 700,
      openInSameTab = false,
      openInNewTab = false,
      onSuccess,
      onCancel,
      onError
    } = options;

    try {
      // First create the transaction
      const transaction = await this.createTransaction(paymentData);

      if (!transaction.success) {
        throw new Error(transaction.message || 'Failed to create transaction');
      }

      if (openInSameTab) {
        // Open in the same tab
        window.location.href = transaction.data.url || `${this.baseUrl}/checkout/${transaction.data.transactionId}`;
        return { window: window, transaction: transaction.data };
      } else if (openInNewTab) {
        // Open in a new tab
        const newTab = window.open(transaction.data.url || `${this.baseUrl}/checkout/${transaction.data.transactionId}`, '_blank');
        if (!newTab) {
          throw new Error('Failed to open checkout in new tab. Please allow popups for this site.');
        }
        return { window: newTab, transaction: transaction.data };
      } else {
        // Create standalone checkout HTML
        const checkoutHtml = this.generateCheckoutHTML(transaction.data);

        // Calculate popup position
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        // Open in popup
        const popup = window.open('', '3PA-Y Checkout', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

        if (!popup) {
          throw new Error('Failed to open popup. Please allow popups for this site.');
        }

        popup.document.write(checkoutHtml);
        popup.document.close();

        // Poll for payment completion
        const pollTimer = setInterval(async () => {
          if (popup.closed) {
            clearInterval(pollTimer);
            onCancel && onCancel();
            return;
          }

          try {
            const result = await this.verifyPayment(transaction.data.transactionId);
            if (result.success && result.data.status === 'completed') {
              clearInterval(pollTimer);
              popup.close();
              onSuccess && onSuccess(result.data);
            }
          } catch (error) {
            console.error('Error checking payment status:', error);
          }
        }, 3000);

        return { popup, transaction: transaction.data };
      }
    } catch (error) {
      onError && onError(error);
      throw error;
    }
  }

  /**
   * Open the checkout creation page
   * @param {Object} options - Options for opening the checkout page
   * @param {boolean} options.openInSameTab - If true, opens in same tab instead of popup
   * @param {boolean} options.openInNewTab - If true, opens in new tab instead of popup
   * @param {number} options.width - Popup width (default: 800)
   * @param {number} options.height - Popup height (default: 600)
   * @param {Object} options.defaultValues - Default values for the form
   * @param {number} options.defaultValues.amount - Default amount
   * @param {string} options.defaultValues.currencyType - Default currency type
   * @param {string} options.defaultValues.callbackUrl - Default callback URL
   */
  openCheckoutPage(options = {}) {
    if (typeof window === 'undefined') {
      throw new Error('openCheckoutPage is only available in browser environment');
    }

    const {
      openInSameTab = false,
      openInNewTab = true,
      width = 800,
      height = 600,
      defaultValues = {}
    } = options;

    // Generate the checkout page HTML with embedded SDK and default values
    const checkoutPageHtml = this.generateCheckoutPageHTML(defaultValues);

    if (openInSameTab) {
      // Open in the same tab
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(checkoutPageHtml);
        newWindow.document.close();
        window.location.href = newWindow.location.href;
      } else {
        // Fallback: create a blob URL
        const blob = new Blob([checkoutPageHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.location.href = url;
      }
      return window;
    } else if (openInNewTab) {
      // Open in a new tab
      const newTab = window.open('', '_blank');
      if (!newTab) {
        throw new Error('Failed to open checkout page in new tab. Please allow popups for this site.');
      }
      newTab.document.write(checkoutPageHtml);
      newTab.document.close();
      return newTab;
    } else {
      // Open in a popup window (default behavior)
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        '',
        '3PA-Y Checkout Creator',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        throw new Error('Failed to open checkout page popup. Please allow popups for this site.');
      }

      popup.document.write(checkoutPageHtml);
      popup.document.close();

      return popup;
    }
  }

  /**
   * Generate the checkout page HTML with embedded SDK and socket integration
   * @param {Object} defaultValues - Default values for the form
   * @returns {string} Complete HTML page
   */
  generateCheckoutPageHTML(defaultValues = {}) {
    const {
      amount = 100.00,
      currencyType = 'USDT-TRC20',
      callbackUrl = 'https://your-site.com/webhook'
    } = defaultValues;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3Pa-Y - Create Checkout</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 40px 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
            color: #667eea;
            text-align: center;
            margin-bottom: 30px;
            font-size: 32px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
        }

        input, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .checkbox-group input[type="checkbox"],
        .checkbox-group input[type="radio"] {
            width: auto;
            margin: 0;
        }

        .checkbox-group label {
            margin-bottom: 0;
            font-weight: normal;
            cursor: pointer;
        }

        button {
            width: 100%;
            padding: 14px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
        }

        button:hover {
            background: #5a6fd8;
        }

        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .result {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            display: none;
        }

        .result.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }

        .result.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }

        .result pre {
            margin-top: 10px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.05);
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
        }

        .info {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }

        .info h3 {
            color: #667eea;
            margin-bottom: 8px;
            font-size: 16px;
        }

        .info p {
            color: #555;
            font-size: 14px;
            line-height: 1.6;
        }


        .transaction-updates {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            max-height: 300px;
            overflow-y: auto;
            display: none;
        }

        .transaction-updates.show {
            display: block;
        }

        .update-item {
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }

        .update-item:last-child {
            border-bottom: none;
        }

        .update-timestamp {
            color: #6c757d;
            font-size: 11px;
        }

        .update-status {
            font-weight: bold;
            margin-left: 10px;
        }

        .update-status.pending {
            color: #ffc107;
        }

        .update-status.completed {
            color: #28a745;
        }

        .update-status.failed {
            color: #dc3545;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>3Pa-Y - Create Checkout</h1>

        <form id="paymentForm">
            <div class="form-group">
                <label for="amount">Amount *</label>
                <input type="number" id="amount" step="0.01" value="${amount}" required>
            </div>

            <div class="form-group">
                <label for="currency">Currency Type *</label>
                <select id="currency" required>
                    <option value="USDT-TRC20" ${currencyType === 'USDT-TRC20' ? 'selected' : ''}>USDT-TRC20</option>
                    <option value="USDT-ERC20" ${currencyType === 'USDT-ERC20' ? 'selected' : ''}>USDT-ERC20</option>
                </select>
            </div>

            <div class="form-group">
                <label for="callbackUrl">Callback URL *</label>
                <input type="url" id="callbackUrl" value="${callbackUrl}" required>
            </div>
            
            <button type="submit" id="submitBtn">
                Create Payment
            </button>
        </form>

        <div id="result" class="result"></div>

        <!-- Real-time Transaction Updates -->
        <div id="transactionUpdates" class="transaction-updates">
            <h3 style="margin-top: 0; color: #667eea; font-size: 16px;">Transaction Updates</h3>
            <div id="updatesList"></div>
        </div>
    </div>

    <!-- Load Socket.IO for real-time updates -->
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <script>
        // Embedded 3PA-Y SDK with Socket Integration
        ${this.getEmbeddedSDKCode()}
    </script>
</body>
</html>`;
  }

  /**
   * Get the embedded SDK code as a string with socket integration
   * @returns {string} SDK code
   */
  getEmbeddedSDKCode() {
    return `
        // Simple Socket Integration
        let socket = null;
        let currentTransactionId = null;

        // Connect to socket server
        function connectSocket() {
            if (socket && socket.connected) return;
            
            socket = io('${this.baseUrl}');
            socket.on('connect', () => updateStatus('Connected', 'connected'));
            socket.on('disconnect', () => updateStatus('Disconnected', 'disconnected'));
            socket.on('connect_error', () => updateStatus('Connection Error', 'disconnected'));
        }

        // Update socket status
        function updateStatus(message, type) {
            console.log(\`Socket Status: \${message}\`);
        }

        // Add transaction update to the list
        function addTransactionUpdate(update) {
            const updatesList = document.getElementById('updatesList');
            const transactionUpdates = document.getElementById('transactionUpdates');
            if (!updatesList || !transactionUpdates) return;
            
            // Get status from different possible locations
            const status = update.status || update.date?.status || update.data?.status || 'unknown';
            const timestamp = new Date().toLocaleTimeString();
            
            // Create update item
            const updateItem = document.createElement('div');
            updateItem.className = 'update-item';
            updateItem.innerHTML = \`
                <span class="update-timestamp">[\${timestamp}]</span>
                <span class="update-status \${status.toLowerCase()}">\${status.toUpperCase()}</span>
                <div style="margin-top: 4px; font-size: 11px; color: #666;">
                    \${JSON.stringify(update, null, 2)}
                </div>
            \`;
            
            updatesList.appendChild(updateItem);
            updatesList.scrollTop = updatesList.scrollHeight;
            transactionUpdates.classList.add('show');
        }

        // Listen for real-time updates
        function listenForTransactionUpdates(transactionId) {
            if (!socket?.connected) return;
            
            // Remove old listener
            if (currentTransactionId) {
                socket.off(\`transaction-status-\${currentTransactionId}\`);
            }
            
            // Add new listener
            currentTransactionId = transactionId;
            socket.on(\`transaction-status-\${transactionId}\`, addTransactionUpdate);
        }

        class ThreePay {
          constructor(config) {
            this.apiKey = config.apiKey;
            this.apiSecret = config.apiSecret;
            this.baseUrl = config.baseUrl || 'http://localhost:5000';
          }

          async request(method, path, data = null) {
            const headers = {
              'Content-Type': 'application/json',
              'apiKey': this.apiKey,
              'x-api-secret': this.apiSecret
            };

            const url = \`\${this.baseUrl}\${path}\`;

            try {
              let response;

              if (typeof window !== 'undefined' && window.fetch) {
                const options = {
                  method,
                  headers,
                  ...(data && { body: JSON.stringify(data) })
                };
                response = await fetch(url, options);

                if (!response.ok) {
                  let errorData;
                  try {
                    errorData = await response.json();
                  } catch (e) {
                    errorData = { message: \`HTTP \${response.status}: \${response.statusText}\` };
                  }
                  throw new Error(errorData.message || errorData.error || \`HTTP \${response.status}\`);
                }

                return await response.json();
              } else {
                throw new Error('Browser environment required');
              }
            } catch (error) {
              throw new Error(\`API request failed: \${error.message}\`);
            }
          }

          async createTransaction(paymentData) {
            const {
              amount,
              currencyType = 'USDT-TRC20',
              callbackUrl,
              openCheckout = true,
              checkoutOptions = {}
            } = paymentData;

            if (!amount || amount <= 0) {
              throw new Error('Invalid amount');
            }

            if (!callbackUrl) {
              throw new Error('Callback URL is required');
            }

            const params = new URLSearchParams({
              amount: amount.toString(),
              currencyType,
              callbackUrl
            });

            const response = await this.request('POST', \`/api/v1/transaction/create?\${params}\`);
            
            if (openCheckout && response.url && typeof window !== 'undefined') {
              const {
                width = 500,
                height = 700,
                windowFeatures = null,
                openInSameTab = false,
                openInNewTab = false
              } = checkoutOptions;

              const checkoutUrl = response.url;
              console.log('Opening checkout with URL:', checkoutUrl);

              if (openInSameTab) {
                window.location.href = checkoutUrl;
                response.checkoutWindow = window;
              } else if (openInNewTab) {
                const newTab = window.open(checkoutUrl, '_blank');
                if (!newTab) {
                  console.warn('Failed to open checkout in new tab. Please allow popups for this site.');
                } else {
                  response.checkoutWindow = newTab;
                }
              } else {
                const left = (window.screen.width - width) / 2;
                const top = (window.screen.height - height) / 2;
                const features = windowFeatures || \`width=\${width},height=\${height},left=\${left},top=\${top},resizable=yes,scrollbars=yes\`;
                const checkoutWindow = window.open(checkoutUrl, '3PA-Y Checkout', features);

                if (!checkoutWindow) {
                  console.warn('Failed to open checkout window. Please allow popups for this site.');
                } else {
                  response.checkoutWindow = checkoutWindow;
                }
              }
            }

            return response;
          }
        }

        // Initialize the checkout page
        function initializeCheckoutPage() {
          console.log('Initializing 3PA-Y Checkout Page...');

          // Initialize 3PA-Y SDK with the same config as the parent
          const threePay = new ThreePay({
            apiKey: '${this.apiKey}',
            apiSecret: '${this.apiSecret}',
            baseUrl: '${this.baseUrl}'
          });

          // Connect to socket
          connectSocket();

          const form = document.getElementById('paymentForm');
          const submitBtn = document.getElementById('submitBtn');
          const resultDiv = document.getElementById('result');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const amount = parseFloat(document.getElementById('amount').value);
            const currencyType = document.getElementById('currency').value;
            const callbackUrl = document.getElementById('callbackUrl').value;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Transaction...';
            resultDiv.className = 'result';
            resultDiv.style.display = 'none';

            try {
              const transactionData = {
                amount,
                currencyType,
                callbackUrl,
                openCheckout: true
              };

              const response = await threePay.createTransaction(transactionData);
              console.log('Transaction Response:', response);

              // Start listening for real-time updates if transaction ID is available
              if (response && response.transactionId) {
                listenForTransactionUpdates(response.transactionId);
              }

            } catch (error) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = \`
                <strong>❌ Error Creating Transaction</strong>
                <pre>\${error.message}</pre>
              \`;
              console.error('Transaction error:', error);
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Create Payment';
            }
          });
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (socket) socket.disconnect();
        });

        // Initialize when page loads
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initializeCheckoutPage);
        } else {
          initializeCheckoutPage();
        }
    `;
  }

  // /**
  //  * Embed checkout inline
  //  */
  // embedCheckout(transactionId, containerId, options = {}) {
  //   if (typeof window === 'undefined' || typeof document === 'undefined') {
  //     throw new Error('embedCheckout is only available in browser environment');
  //   }

  //   const { width = '100%', height = '600px' } = options;
  //   const container = document.getElementById(containerId);

  //   if (!container) {
  //     throw new Error('Container element not found');
  //   }

  //   const iframe = document.createElement('iframe');
  //   iframe.src = `${this.baseUrl}/checkout/${transactionId}`;
  //   iframe.style.width = width;
  //   iframe.style.height = height;
  //   iframe.style.border = 'none';
  //   iframe.style.borderRadius = '10px';

  //   container.appendChild(iframe);

  //   return iframe;
  // }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThreePay;
}

if (typeof window !== 'undefined') {
  window.ThreePay = ThreePay;
}

