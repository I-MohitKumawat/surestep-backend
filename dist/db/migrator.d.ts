/**
 * Splits SQL script into discrete statements, respecting comments,
 * string literals, and $$ ... $$ dollar-quoted blocks.
 */
export declare function splitSqlStatements(sql: string): string[];
export declare function runMigrations(): Promise<{
    applied: string[];
    alreadyApplied: string[];
}>;
//# sourceMappingURL=migrator.d.ts.map