export declare function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, map: (value: T, index: number) => Promise<R>): Promise<R[]>;
