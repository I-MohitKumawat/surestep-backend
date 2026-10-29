"use strict";
/**
 * SureStep — modules/memories/memories.controller.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemory = createMemory;
exports.listMemories = listMemories;
exports.getMemoryById = getMemoryById;
exports.updateMemory = updateMemory;
exports.deleteMemory = deleteMemory;
exports.recordActivity = recordActivity;
exports.listActivities = listActivities;
const authoritative_memories_service_1 = require("./authoritative-memories.service");
const response_1 = require("../../shared/utils/response");
async function createMemory(req, res) {
    const { patientId } = req.params;
    const memory = await authoritative_memories_service_1.authoritativeMemoriesService.createMemory(patientId, req.user.id, req.body);
    (0, response_1.created)(res, { memory });
}
async function listMemories(req, res) {
    const { patientId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const cursor = req.query.cursor;
    const personId = req.query.personId;
    const result = await authoritative_memories_service_1.authoritativeMemoriesService.getMemories(patientId, limit, cursor, personId);
    (0, response_1.ok)(res, result);
}
async function getMemoryById(req, res) {
    const { patientId, memoryId } = req.params;
    const memory = await authoritative_memories_service_1.authoritativeMemoriesService.getMemoryById(patientId, memoryId);
    (0, response_1.ok)(res, { memory });
}
async function updateMemory(req, res) {
    const { patientId, memoryId } = req.params;
    const memory = await authoritative_memories_service_1.authoritativeMemoriesService.updateMemory(patientId, memoryId, req.body);
    (0, response_1.ok)(res, { memory });
}
async function deleteMemory(req, res) {
    const { patientId, memoryId } = req.params;
    const result = await authoritative_memories_service_1.authoritativeMemoriesService.deleteMemory(patientId, memoryId, req.user.id);
    (0, response_1.ok)(res, result);
}
async function recordActivity(req, res) {
    const { patientId } = req.params;
    const activity = await authoritative_memories_service_1.authoritativeMemoriesService.recordActivityAttempt(patientId, req.body);
    (0, response_1.created)(res, { activity });
}
async function listActivities(req, res) {
    const { patientId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const cursor = req.query.cursor;
    const result = await authoritative_memories_service_1.authoritativeMemoriesService.getActivityAttempts(patientId, limit, cursor);
    (0, response_1.ok)(res, result);
}
//# sourceMappingURL=memories.controller.js.map