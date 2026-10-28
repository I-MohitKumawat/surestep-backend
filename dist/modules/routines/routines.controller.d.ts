/**
 * SureStep Backend — modules/routines/routines.controller.ts
 * HTTP handlers for routine templates, attachments, tasks, and adherence.
 */
import { Request, Response } from 'express';
export declare function createDefinition(req: Request, res: Response): Promise<void>;
export declare function updateDefinition(req: Request, res: Response): Promise<void>;
export declare function getDefinitions(req: Request, res: Response): Promise<void>;
export declare function getDefinitionById(req: Request, res: Response): Promise<void>;
export declare function deleteDefinition(req: Request, res: Response): Promise<void>;
export declare function listOccurrences(req: Request, res: Response): Promise<void>;
export declare function signOffOccurrence(req: Request, res: Response): Promise<void>;
export declare function listRoutineTemplates(req: Request, res: Response): Promise<void>;
export declare function createRoutineTemplate(req: Request, res: Response): Promise<void>;
export declare function updateRoutineTemplate(req: Request, res: Response): Promise<void>;
export declare function deactivateRoutineTemplate(req: Request, res: Response): Promise<void>;
export declare function addAttachment(req: Request, res: Response): Promise<void>;
export declare function removeAttachment(req: Request, res: Response): Promise<void>;
export declare function getTodayTasks(req: Request, res: Response): Promise<void>;
export declare function getTaskHistory(req: Request, res: Response): Promise<void>;
export declare function createTask(req: Request, res: Response): Promise<void>;
export declare function updateTask(req: Request, res: Response): Promise<void>;
export declare function deleteTask(req: Request, res: Response): Promise<void>;
export declare function updateTaskStatus(req: Request, res: Response): Promise<void>;
export declare function completeTask(req: Request, res: Response): Promise<void>;
export declare function unsureTask(req: Request, res: Response): Promise<void>;
export declare function getAdherenceSnapshot(req: Request, res: Response): Promise<void>;
export declare function getTemplates(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=routines.controller.d.ts.map