export type Json = null | boolean | number | string | Json[] | {
    [k: string]: Json;
};
export declare function fetchJson<T>(url: string, init?: RequestInit): Promise<T>;
export declare function withQuery(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined | (string | number | boolean)[]>): string;
//# sourceMappingURL=http.d.ts.map