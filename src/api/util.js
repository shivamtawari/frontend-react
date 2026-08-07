// Function to get auth token from storage
export const getAuthToken = () => {
    try {
        return localStorage.getItem('auth_token');
    } catch (error) {
        return null;
    }
};

// Function to get auth headers
export const getAuthHeaders = (additionalHeaders = {}) => {
    const token = getAuthToken();
    const headers = {
        ...additionalHeaders,
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
};

/**
 * Build a URL with query parameters that works with both absolute and relative base URLs
 * @param {string} baseUrl - The base URL (can be absolute like http://... or relative like /api)
 * @param {string} path - The path to append to the base URL
 * @param {Object} params - Query parameters as key-value pairs
 * @returns {string} The complete URL with query parameters
 */
export const buildUrl = (baseUrl, path, params = {}) => {
    // Remove trailing slash from base and leading slash from path for clean joining
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    
    // Check if base is absolute or relative
    const isAbsolute = cleanBase.startsWith('http://') || cleanBase.startsWith('https://');
    
    if (isAbsolute) {
        // Use URL API for absolute URLs.
        // Ensure base ends with "/" so path-style base segments like "/api"
        // are preserved (otherwise URL() treats last segment as a file).
        const absoluteBase = cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`;
        const url = new URL(cleanPath, absoluteBase);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                url.searchParams.append(key, String(value));
            }
        });
        return url.toString();
    } else {
        // Handle relative URLs with string concatenation
        const fullPath = `${cleanBase}/${cleanPath}`;
        const urlParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                urlParams.append(key, String(value));
            }
        });
        const queryString = urlParams.toString();
        return queryString ? `${fullPath}?${queryString}` : fullPath;
    }
};

// Function to handle API errors
export const handleApiError = async (response) => {
    if (!response.ok) {
        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
            // Clear auth state
            try {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_user');
                // Trigger a custom event that components can listen to
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            } catch (error) {
                console.error('Error clearing auth state:', error);
            }
            throw new Error('Unauthorized. Please log in again.');
        }

        // Try to parse the error message from the response
        try {
            const errorData = await response.json();

            // Handle FastAPI validation errors which come in 'detail' field
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    // FastAPI validation errors are often arrays
                    const errorMessage = errorData.detail
                        .map((err) => `${err.loc.join(".")}: ${err.msg}`)
                        .join(", ");
                    throw new Error(`API Validation Error: ${errorMessage}`);
                } else if (typeof errorData.detail === "string") {
                    throw new Error(`API Error: ${errorData.detail}`);
                } else if (errorData.detail && typeof errorData.detail.message === "string") {
                    // Structured backend error payload, e.g. { message, error_code, details }
                    const { message, error_code: errorCode, details } = errorData.detail;
                    const suffix = errorCode ? ` (${errorCode})` : "";
                    const detailsSuffix = details && Object.keys(details).length
                        ? `\n${JSON.stringify(details, null, 2)}`
                        : "";
                    throw new Error(`API Error: ${message}${suffix}${detailsSuffix}`);
                } else {
                    // Fallback for any other non-string detail shape
                    throw new Error(`API Error: ${JSON.stringify(errorData.detail, null, 2)}`);
                }
            }

            // Handle general error message
            if (errorData.message) {
                throw new Error(`API Error: ${errorData.message}`);
            }

            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        } catch (parseError) {
            if (parseError instanceof SyntaxError) {
                // Could not parse the error response as JSON
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            throw parseError;
        }
    }
    return response.json();
};