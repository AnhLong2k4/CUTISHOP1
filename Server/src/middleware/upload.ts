import multer from 'multer';

/** Product images are kept in memory and streamed to the media provider. */
export const uploadProductImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith('image/')) callback(null, true);
    else callback(new Error('Only image files are allowed'));
  },
});
