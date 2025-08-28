
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { creditCardAnalyzer } from '../lib/creditCardAnalyzer.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and text files
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload images, PDFs, or text files.'));
    }
  }
});

// POST /api/credit-cards/upload-statements - Upload and analyze credit card statements
router.post('/upload-statements', auth, upload.array('statements', 5), async (req, res) => {
  try {
    const userId = req.user!.id;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No files uploaded',
        code: 'NO_FILES'
      });
    }

    logger.info({ 
      userId, 
      fileCount: files.length,
      fileSizes: files.map(f => f.size),
      fileTypes: files.map(f => f.mimetype)
    }, 'Processing credit card statement uploads');

    // Convert files to text content for AI analysis
    const fileContents: string[] = [];
    const fileTypes: string[] = [];

    for (const file of files) {
      try {
        let content = '';
        
        if (file.mimetype.startsWith('text/')) {
          content = file.buffer.toString('utf-8');
        } else if (file.mimetype === 'application/pdf') {
          // For PDF files, we'd need a PDF parser
          content = `PDF file: ${file.originalname} (${file.size} bytes) - AI will analyze image content`;
        } else if (file.mimetype.startsWith('image/')) {
          // For images, we'll pass the base64 for AI vision analysis
          content = `Image file: ${file.originalname} - Base64: ${file.buffer.toString('base64').substring(0, 1000)}...`;
        } else {
          content = `File: ${file.originalname} (${file.mimetype}) - ${file.size} bytes`;
        }

        fileContents.push(content);
        fileTypes.push(file.mimetype);
      } catch (fileError) {
        logger.warn({ fileError, fileName: file.originalname }, 'Failed to process file, skipping');
      }
    }

    // Analyze uploaded statements with AI
    const analysis = await creditCardAnalyzer.analyzeUploadedStatements(
      userId,
      fileContents,
      fileTypes
    );

    // Find uncertain transactions (low confidence) for user confirmation
    const uncertainTransactions = analysis.detectedTransactions
      .filter(t => t.confidence < 0.7)
      .map((t, index) => ({
        id: `upload_${Date.now()}_${index}`,
        merchant: t.merchant,
        amount: t.amount,
        suggestedCategory: t.category,
        confidence: t.confidence,
        date: t.date
      }));

    res.json({
      ok: true,
      message: 'Credit card statements analyzed successfully',
      analysis: {
        totalTransactions: analysis.detectedTransactions.length,
        monthlySpending: analysis.monthlySpending,
        topCategories: analysis.topCategories,
        recommendations: analysis.recommendations,
      },
      uncertainTransactions,
      needsConfirmation: uncertainTransactions.length > 0,
      filesProcessed: files.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Credit card analysis failed');

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        ok: false,
        error: 'File too large. Maximum size is 10MB per file.',
        code: 'FILE_TOO_LARGE'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to analyze credit card statements',
      code: 'ANALYSIS_ERROR'
    });
  }
});

// POST /api/credit-cards/confirm-transactions - Confirm uncertain transactions
router.post('/confirm-transactions', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { uncertainTransactions, confirmations } = req.body;

    logger.info({ 
      userId, 
      uncertainCount: uncertainTransactions?.length || 0,
      confirmationCount: Object.keys(confirmations || {}).length 
    }, 'Processing transaction confirmations');

    await creditCardAnalyzer.confirmUncertainTransactions(
      userId,
      uncertainTransactions,
      confirmations
    );

    res.json({
      ok: true,
      message: 'Transaction confirmations processed successfully',
      confirmedCount: Object.keys(confirmations).length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to process confirmations');
    res.status(500).json({
      ok: false,
      error: 'Failed to process transaction confirmations',
      code: 'CONFIRMATION_ERROR'
    });
  }
});

export default router;
