export class ApiError extends Error {
    constructor(message, code, status) {
        super(message || 'Request failed');
        this.name = 'ApiError';
        this.code = code || 'api_error';
        this.status = status || 0;
    }
}

export class NetworkError extends Error {
    constructor(message) {
        super(message || 'Network error');
        this.name = 'NetworkError';
        this.status = 0;
    }
}

export class ApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.defaultTimeout = options.timeout || 60000;
        this.defaultRetries = options.maxRetries || 3;
    }

    async uploadProject(file, password, preferredLanguage, options = {}) {
        const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : this.defaultRetries;
        const timeout = Number.isFinite(options.timeout) ? options.timeout : this.defaultTimeout;

        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
            try {
                const response = await this.#fetchWithTimeout(`${this.baseUrl}/api/upload`, {
                    method: 'POST',
                    body: this.#buildFormData(file, password, preferredLanguage)
                }, timeout);

                const bodyText = await response.text();
                if (!response.ok) {
                    throw new ApiError(bodyText || response.statusText, 'upload_failed', response.status);
                }

                const data = JSON.parse(bodyText);
                this.#validateProjectData(data);
                return data;
            } catch (error) {
                if (attempt === maxRetries || !this.#isRetryable(error)) {
                    throw error;
                }
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await this.#sleep(delay);
            }
        }

        throw new ApiError('Upload failed after retries', 'upload_failed', 0);
    }

    #buildFormData(file, password, preferredLanguage) {
        const formData = new FormData();
        formData.append('file', file);
        if (password) {
            formData.append('password', password);
        }
        if (preferredLanguage) {
            formData.append('product_language', preferredLanguage);
        }
        return formData;
    }

    #validateProjectData(data) {
        if (!data || typeof data !== 'object') {
            throw new ApiError('Invalid response payload', 'invalid_response', 0);
        }
        if (!data.project_name && !data.projectName) {
            throw new ApiError('Missing project name in response', 'invalid_response', 0);
        }
        if (!data.group_address_graph || !data.topology_graph) {
            throw new ApiError('Missing graph data in response', 'invalid_response', 0);
        }
    }

    #isRetryable(error) {
        if (error instanceof NetworkError) return true;
        if (error instanceof ApiError) {
            return error.status >= 500 && error.status < 600;
        }
        return false;
    }

    async #fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                throw new NetworkError('Request timed out');
            }
            throw new NetworkError(error.message || 'Network error');
        } finally {
            clearTimeout(timeout);
        }
    }

    #sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
