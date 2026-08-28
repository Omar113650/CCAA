import multer from 'multer';

// Use memory storage for quick parsing without saving to disk
const storage = multer.memoryStorage();

// Accept only Excel files
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files are allowed!'), false);
  }
};

export const uploadBOQMiddleware = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file'); // 'file' is the field name for the upload
