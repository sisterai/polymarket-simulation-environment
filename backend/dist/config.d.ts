import { z } from "zod";
declare const EnvSchema: z.ZodObject<{
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    DATA_DIR: z.ZodDefault<z.ZodString>;
    GAMMA_BASE_URL: z.ZodDefault<z.ZodString>;
    CLOB_BASE_URL: z.ZodDefault<z.ZodString>;
    CLOB_WSS_URL: z.ZodDefault<z.ZodString>;
    DATA_API_BASE_URL: z.ZodDefault<z.ZodString>;
    MARKET_SEARCH_QUERY: z.ZodDefault<z.ZodString>;
    MARKET_TYPE_HINT: z.ZodDefault<z.ZodString>;
    PINNED_MARKET_SLUGS: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AppConfig = z.infer<typeof EnvSchema>;
export declare function loadConfig(): AppConfig;
export {};
//# sourceMappingURL=config.d.ts.map