import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import * as svc from './assessment.service';
import { z } from 'zod';

const AssessmentSaveSchema = z.object({
  status: z.enum(['DRAFT', 'COMPLETED']),
  patient_basics: z.object({
    preferred_name: z.string(),
    address: z.string(),
    living_arrangement: z.string(),
    primary_language: z.string(),
  }).default({ preferred_name: '', address: '', living_arrangement: '', primary_language: '' }),
  emergency_contacts: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
    priority: z.number(),
  })).default([]),
  cognitive: z.object({
    memory_concerns: z.string(),
    orientation_concerns: z.string(),
    wandering_risk: z.string(),
    confusion_frequency: z.string(),
  }).default({ memory_concerns: '', orientation_concerns: '', wandering_risk: '', confusion_frequency: '' }),
  risk: z.object({
    fall_risk: z.enum(['Low', 'Medium', 'High']),
    wandering_risk: z.enum(['Low', 'Medium', 'High']),
    medication_adherence_risk: z.enum(['Low', 'Medium', 'High']),
    emergency_risk: z.enum(['Low', 'Medium', 'High']),
  }).default({ fall_risk: 'Low', wandering_risk: 'Low', medication_adherence_risk: 'Low', emergency_risk: 'Low' }),
  mobility: z.string(),
  support_needs: z.object({
    medication_reminders: z.boolean(),
    meal_reminders: z.boolean(),
    hydration_reminders: z.boolean(),
    exercise_reminders: z.boolean(),
    appointment_reminders: z.boolean(),
    safety_monitoring: z.boolean(),
  }).default({
    medication_reminders: false,
    meal_reminders: false,
    hydration_reminders: false,
    exercise_reminders: false,
    appointment_reminders: false,
    safety_monitoring: false,
  }),
  tech_comfort: z.string(),
  notes: z.object({
    observations: z.string(),
    meeting_summary: z.string(),
    recommendations: z.string(),
  }).default({ observations: '', meeting_summary: '', recommendations: '' }),
});

export async function getLatest(req: Request, res: Response) {
  const { patientId } = req.params;
  const assessment = await svc.getLatestAssessment(patientId);
  ok(res, { assessment });
}

export async function getHistory(req: Request, res: Response) {
  const { patientId } = req.params;
  const history = await svc.getAssessmentHistory(patientId);
  ok(res, { history });
}

export async function getById(req: Request, res: Response) {
  const { id } = req.params;
  const assessment = await svc.getAssessmentById(id);
  ok(res, { assessment });
}

export async function save(req: Request, res: Response) {
  const { patientId } = req.params;
  const payload = AssessmentSaveSchema.parse(req.body);
  const result = await svc.saveAssessment(req.user!.id, patientId, payload);
  ok(res, result);
}
