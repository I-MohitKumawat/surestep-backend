"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const authenticate_1 = require("../../shared/middleware/authenticate");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// Ensure uploads directory exists relative to process working directory
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Multer disk storage config
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname) || '.jpg';
        cb(null, `photo-${uniqueSuffix}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new AppError_1.AppError('VALIDATION_ERROR', 'Only image files are allowed', 400));
        }
    },
});
router.post('/upload/photo', upload.single('photo'), (0, response_1.asyncHandler)(async (req, res) => {
    if (!req.file) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'No photo file provided', 400);
    }
    const host = req.get('host');
    const photoUrl = `${req.protocol}://${host}/uploads/${req.file.filename}`;
    (0, response_1.ok)(res, {
        photoUrl,
        url: photoUrl,
        filename: req.file.filename,
    });
}));
exports.default = router;
//# sourceMappingURL=media.router.js.map