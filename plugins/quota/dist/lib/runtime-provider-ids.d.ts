import type { QuotaProviderContext } from "./entries.js";
export type RuntimeProviderIdResolver = () => Promise<ReadonlySet<string>>;
export declare function createRuntimeProviderIdResolver(client: QuotaProviderContext["client"]): RuntimeProviderIdResolver;
