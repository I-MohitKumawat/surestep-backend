/**
 * SureStep Backend — modules/routines/routines.controller.ts
 * HTTP handlers for canonical routine definitions, occurrences, and sign-off.
 */
import { Request, Response } from 'express';
export declare function createDefinition(req: Request, res: Response): Promise<void>;
export declare function updateDefinition(req: Request, res: Response): Promise<void>;
export declare function getDefinitions(req: Request, res: Response): Promise<void>;
export declare function getDefinitionById(req: Request, res: Response): Promise<void>;
export declare function deleteDefinition(req: Request, res: Response): Promise<void>;
export declare function listOccurrences(req: Request, res: Response): Promise<void>;
export declare function signOffOccurrence(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=routines.controller.d.ts.map