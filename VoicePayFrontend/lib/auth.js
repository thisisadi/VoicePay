/**
 * Authentication utility functions
 * Handles JWT token expiration and logout
 */

/**
 * Handle token expiration - clears JWT and redirects to login
 * @param {any} router - Next.js router instance (AppRouterInstance)
 * @param {any} disconnect - Wagmi disconnect function (optional)
 */
export const handleTokenExpiration = (router, disconnect = null) => {
    // Clear JWT token
    if (typeof window !== "undefined") {
        localStorage.removeItem("jwt");
    }
    
    // Disconnect wallet if disconnect function is provided
    if (disconnect && typeof disconnect === "function") {
        disconnect();
    }
    
    // Redirect to login page
    if (router && typeof router.replace === "function") {
        router.replace("/");
    }
};

/**
 * Check if response indicates token expiration
 * @param {Response} response - Fetch response object
 * @returns {boolean} - True if token is expired/invalid
 */
export const isTokenExpired = (response) => {
    return response.status === 401 || response.status === 403;
};

/**
 * Wrapper for fetch that handles token expiration automatically
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @param {Function} router - Next.js router instance
 * @param {Function} disconnect - Wagmi disconnect function (optional)
 * @returns {Promise<Response>} - Fetch response
 */
export const authenticatedFetch = async (url, options = {}, router = null, disconnect = null) => {
    const response = await fetch(url, options);
    
    // Check for token expiration
    if (isTokenExpired(response)) {
        handleTokenExpiration(router, disconnect);
        throw new Error("Session expired. Please log in again.");
    }
    
    return response;
};

