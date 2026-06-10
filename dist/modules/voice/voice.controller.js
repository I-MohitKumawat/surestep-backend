"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSample = uploadSample;
exports.listSamples = listSamples;
exports.removeSample = removeSample;
exports.sendManualMessage = sendManualMessage;
exports.listMessages = listMessages;
exports.addFace = addFace;
exports.listFaces = listFaces;
exports.postStory = postStory;
exports.listStories = listStories;
exports.reactStory = reactStory;
exports.addMemory = addMemory;
exports.getDailyMemory = getDailyMemory;
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./voice.service"));
// Voice Samples
async function uploadSample(req, res) {
    const sample = await svc.uploadSample(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { sample });
}
async function listSamples(req, res) {
    const samples = await svc.getSamples(req.params.patientId);
    (0, response_1.ok)(res, { samples });
}
async function removeSample(req, res) {
    await svc.deleteSample(req.params.id, req.user.id);
    (0, response_1.ok)(res, { message: 'Sample removed. Consent record retained.' });
}
// Voice Messages
async function sendManualMessage(req, res) {
    const msg = await svc.sendManualMessage(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { message: msg });
}
async function listMessages(req, res) {
    const { limit = '20', cursor } = req.query;
    const result = await svc.getMessages(req.params.patientId, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}
// Faces
async function addFace(req, res) {
    const face = await svc.addFace(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { face });
}
async function listFaces(req, res) {
    const faces = await svc.getFaces(req.params.patientId);
    (0, response_1.ok)(res, { faces });
}
// Stories
async function postStory(req, res) {
    const story = await svc.postStory(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { story });
}
async function listStories(req, res) {
    const { limit = '10', cursor } = req.query;
    const result = await svc.getStories(req.params.patientId, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}
async function reactStory(req, res) {
    const story = await svc.reactToStory(req.params.id, req.user.id);
    (0, response_1.ok)(res, { story });
}
// Memories
async function addMemory(req, res) {
    const mem = await svc.addMemory(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { memory: mem });
}
async function getDailyMemory(req, res) {
    const memory = await svc.getDailyMemory(req.params.patientId);
    (0, response_1.ok)(res, { memory });
}
//# sourceMappingURL=voice.controller.js.map