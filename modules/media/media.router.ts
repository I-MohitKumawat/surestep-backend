import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../shared/middleware/authenticate';
import { asyncHandler, ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';

const router = Router();
router.use(authenticate);

// Ensure uploads directory exists relative to process working directory
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('VALIDATION_ERROR', 'Only image files are allowed', 400));
    }
  },
});

router.post('/upload/photo', upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('VALIDATION_ERROR', 'No photo file provided', 400);
  }
  
  const host = req.get('host');
  const photoUrl = `${req.protocol}://${host}/uploads/${req.file.filename}`;
  
  ok(res, {
    photoUrl,
    url: photoUrl,
    filename: req.file.filename,
  });
}));

export default router;
